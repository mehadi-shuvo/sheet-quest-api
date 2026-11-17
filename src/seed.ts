import { PrismaClient } from '@prisma/client';
import { seedM02Content } from './seed/m02-content.seed';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The non-production seed command cannot run with NODE_ENV=production.');
  }
  const prisma = new PrismaClient();
  try {
    const result = await seedM02Content(prisma);
    console.log(`Seeded ${result.lessonCount} fixture lessons for course ${result.courseId}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
