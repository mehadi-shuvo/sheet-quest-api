import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonResponseInterceptor } from './lesson-response.interceptor';

@Controller('lessons')
@UseInterceptors(LessonResponseInterceptor)
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get(':lessonId')
  getLesson(@Param('lessonId') lessonId: string) {
    return this.lessons.getLesson(lessonId);
  }

  @Post(':lessonId/submissions')
  submitLesson(@Param('lessonId') lessonId: string, @Body() payload: unknown) {
    return this.lessons.submitLesson(lessonId, payload);
  }
}
