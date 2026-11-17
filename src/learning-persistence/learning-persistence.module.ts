import { Module } from '@nestjs/common';
import { LearningPersistenceService } from './learning-persistence.service';

@Module({ providers: [LearningPersistenceService], exports: [LearningPersistenceService] })
export class LearningPersistenceModule {}
