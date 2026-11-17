export type FormulaAst =
  | { type: 'binary'; left: FormulaAst; operator: BinaryOperator; right: FormulaAst }
  | { type: 'cell'; address: string }
  | { type: 'function'; arguments: FormulaAst[]; name: string }
  | { type: 'literal'; value: boolean | null | number | string }
  | { type: 'range'; end: string; start: string }
  | { type: 'unary'; operand: FormulaAst; operator: '+' | '-' };

export type BinaryOperator = '+' | '-' | '*' | '/' | '^' | '=' | '<>' | '<' | '<=' | '>' | '>=';

export type FormulaParseLimits = {
  maxAstNodes: number;
  maxFormulaLength: number;
  maxTokens: number;
};

export const DEFAULT_FORMULA_PARSE_LIMITS: FormulaParseLimits = {
  maxAstNodes: 256,
  maxFormulaLength: 1_024,
  maxTokens: 512,
};

export class FormulaParseError extends Error {
  constructor(
    public readonly code: 'INVALID_FORMULA' | 'RESOURCE_LIMIT' | 'UNSUPPORTED_FEATURE',
    message: string
  ) {
    super(message);
    this.name = 'FormulaParseError';
  }
}

type Token =
  | { type: 'cell'; value: string }
  | { type: 'comma' | 'colon' | 'leftParen' | 'rightParen' }
  | { type: 'identifier'; value: string }
  | { type: 'number'; value: number }
  | { type: 'operator'; value: BinaryOperator | '+' | '-' }
  | { type: 'string'; value: string };

const CELL_REFERENCE = /^\$?([A-Z]+)\$?([1-9]\d*)$/;

function canonicalAddress(reference: string) {
  const match = CELL_REFERENCE.exec(reference);
  if (!match) return null;
  return `${match[1]}${match[2]}`;
}

function isDigit(character: string | undefined) {
  return character !== undefined && character >= '0' && character <= '9';
}

function isIdentifierStart(character: string | undefined) {
  return character !== undefined && /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string | undefined) {
  return character !== undefined && /[A-Za-z0-9_.]/.test(character);
}

function tokenize(expression: string, limits: FormulaParseLimits): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const add = (token: Token) => {
    tokens.push(token);
    if (tokens.length > limits.maxTokens) throw new FormulaParseError('RESOURCE_LIMIT', 'Formula contains too many tokens.');
  };

  while (index < expression.length) {
    const character = expression[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      let value = '';
      index += 1;
      let terminated = false;
      while (index < expression.length) {
        if (expression[index] === '"' && expression[index + 1] === '"') {
          value += '"';
          index += 2;
        } else if (expression[index] === '"') {
          index += 1;
          terminated = true;
          break;
        } else {
          value += expression[index];
          index += 1;
        }
      }
      if (!terminated) throw new FormulaParseError('INVALID_FORMULA', 'String literal is not terminated.');
      add({ type: 'string', value });
      continue;
    }
    if (isDigit(character) || (character === '.' && isDigit(expression[index + 1]))) {
      const start = index;
      index += 1;
      while (isDigit(expression[index]) || expression[index] === '.') index += 1;
      const value = Number(expression.slice(start, index));
      if (!Number.isFinite(value)) throw new FormulaParseError('INVALID_FORMULA', 'Numeric literal is invalid.');
      add({ type: 'number', value });
      continue;
    }
    if (character === '$' || isIdentifierStart(character)) {
      const start = index;
      if (character === '$') index += 1;
      while (isIdentifierPart(expression[index]) || expression[index] === '$') index += 1;
      const value = expression.slice(start, index);
      const address = canonicalAddress(value);
      add(address ? { type: 'cell', value: address } : { type: 'identifier', value: value.toUpperCase() });
      continue;
    }
    if (character === ',') {
      add({ type: 'comma' });
      index += 1;
      continue;
    }
    if (character === ':') {
      add({ type: 'colon' });
      index += 1;
      continue;
    }
    if (character === '(') {
      add({ type: 'leftParen' });
      index += 1;
      continue;
    }
    if (character === ')') {
      add({ type: 'rightParen' });
      index += 1;
      continue;
    }
    const twoCharacterOperator = expression.slice(index, index + 2);
    if (twoCharacterOperator === '<=' || twoCharacterOperator === '>=' || twoCharacterOperator === '<>') {
      add({ type: 'operator', value: twoCharacterOperator });
      index += 2;
      continue;
    }
    if ('+-*/^=<>'.includes(character)) {
      add({ type: 'operator', value: character as BinaryOperator | '+' | '-' });
      index += 1;
      continue;
    }
    throw new FormulaParseError('UNSUPPORTED_FEATURE', `Unsupported formula character: ${character}`);
  }
  return tokens;
}

class Parser {
  private index = 0;
  private nodeCount = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly limits: FormulaParseLimits
  ) {}

  parse() {
    const expression = this.parseComparison();
    if (this.peek()) throw new FormulaParseError('INVALID_FORMULA', 'Formula contains an unexpected token.');
    return expression;
  }

  private addNode(node: FormulaAst): FormulaAst {
    this.nodeCount += 1;
    if (this.nodeCount > this.limits.maxAstNodes) throw new FormulaParseError('RESOURCE_LIMIT', 'Formula is too complex.');
    return node;
  }

  private consume(type: Token['type']) {
    const token = this.peek();
    if (!token || token.type !== type) return undefined;
    this.index += 1;
    return token;
  }

  private expect(type: Token['type']) {
    const token = this.consume(type);
    if (!token) throw new FormulaParseError('INVALID_FORMULA', `Expected ${type}.`);
    return token;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private parseComparison(): FormulaAst {
    let left = this.parseAdditive();
    const token = this.peek();
    if (token?.type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(token.value)) {
      this.index += 1;
      left = this.addNode({ type: 'binary', left, operator: token.value as BinaryOperator, right: this.parseAdditive() });
    }
    return left;
  }

  private parseAdditive(): FormulaAst {
    let left = this.parseMultiplicative();
    while (true) {
      const token = this.peek();
      if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) return left;
      this.index += 1;
      left = this.addNode({ type: 'binary', left, operator: token.value, right: this.parseMultiplicative() });
    }
  }

  private parseMultiplicative(): FormulaAst {
    let left = this.parsePower();
    while (true) {
      const token = this.peek();
      if (token?.type !== 'operator' || (token.value !== '*' && token.value !== '/')) return left;
      this.index += 1;
      left = this.addNode({ type: 'binary', left, operator: token.value, right: this.parsePower() });
    }
  }

  private parsePower(): FormulaAst {
    let left = this.parseUnary();
    const token = this.peek();
    if (token?.type === 'operator' && token.value === '^') {
      this.index += 1;
      left = this.addNode({ type: 'binary', left, operator: '^', right: this.parsePower() });
    }
    return left;
  }

  private parseUnary(): FormulaAst {
    const token = this.peek();
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.index += 1;
      return this.addNode({ type: 'unary', operator: token.value, operand: this.parseUnary() });
    }
    return this.parseRange();
  }

  private parseRange(): FormulaAst {
    const start = this.parsePrimary();
    if (!this.consume('colon')) return start;
    const end = this.parsePrimary();
    if (start.type !== 'cell' || end.type !== 'cell') {
      throw new FormulaParseError('UNSUPPORTED_FEATURE', 'Ranges must contain cell references.');
    }
    return this.addNode({ type: 'range', start: start.address, end: end.address });
  }

  private parsePrimary(): FormulaAst {
    const token = this.peek();
    if (!token) throw new FormulaParseError('INVALID_FORMULA', 'Formula ended unexpectedly.');
    if (token.type === 'number' || token.type === 'string') {
      this.index += 1;
      return this.addNode({ type: 'literal', value: token.value });
    }
    if (token.type === 'cell') {
      this.index += 1;
      return this.addNode({ type: 'cell', address: token.value });
    }
    if (token.type === 'identifier') {
      this.index += 1;
      if (token.value === 'TRUE') return this.addNode({ type: 'literal', value: true });
      if (token.value === 'FALSE') return this.addNode({ type: 'literal', value: false });
      this.expect('leftParen');
      const argumentsList: FormulaAst[] = [];
      if (!this.consume('rightParen')) {
        do {
          argumentsList.push(this.parseComparison());
        } while (this.consume('comma'));
        this.expect('rightParen');
      }
      return this.addNode({ type: 'function', arguments: argumentsList, name: token.value });
    }
    if (this.consume('leftParen')) {
      const expression = this.parseComparison();
      this.expect('rightParen');
      return expression;
    }
    throw new FormulaParseError('INVALID_FORMULA', 'Formula contains an unexpected token.');
  }
}

export function parseFormula(formula: string, limits: FormulaParseLimits = DEFAULT_FORMULA_PARSE_LIMITS): FormulaAst {
  if (typeof formula !== 'string' || !formula.startsWith('=')) {
    throw new FormulaParseError('INVALID_FORMULA', 'Formula must start with =.');
  }
  if (formula.length > limits.maxFormulaLength) {
    throw new FormulaParseError('RESOURCE_LIMIT', 'Formula exceeds the evaluator length limit.');
  }
  const expression = formula.slice(1);
  if (!expression.trim()) throw new FormulaParseError('INVALID_FORMULA', 'Formula must contain an expression.');
  return new Parser(tokenize(expression, limits), limits).parse();
}

export function astContainsFunction(ast: FormulaAst, functionName: string): boolean {
  const normalizedFunction = functionName.toUpperCase();
  switch (ast.type) {
    case 'function':
      return ast.name === normalizedFunction || ast.arguments.some((argument) => astContainsFunction(argument, normalizedFunction));
    case 'binary':
      return astContainsFunction(ast.left, normalizedFunction) || astContainsFunction(ast.right, normalizedFunction);
    case 'unary':
      return astContainsFunction(ast.operand, normalizedFunction);
    default:
      return false;
  }
}
