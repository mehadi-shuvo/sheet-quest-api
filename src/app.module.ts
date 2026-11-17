import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { LessonsModule } from './lessons/lessons.module';
import { LearningPersistenceModule } from './learning-persistence/learning-persistence.module';
import { PrismaService } from './prisma.service';
@Module({ imports: [LessonsModule, LearningPersistenceModule], controllers: [HealthController], providers: [PrismaService] })
export class AppModule {}
