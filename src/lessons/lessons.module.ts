import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonRegistryService } from './lesson-registry.service';
import { LessonsService } from './lessons.service';
import { LessonResponseInterceptor } from './lesson-response.interceptor';

@Module({
  controllers: [LessonsController],
  providers: [LessonRegistryService, LessonsService, LessonResponseInterceptor],
})
export class LessonsModule {}
