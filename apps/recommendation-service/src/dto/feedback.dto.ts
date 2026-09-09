import { IsIn } from 'class-validator';

export class FeedbackDto {
  @IsIn(['accepted', 'rejected', 'ignored'])
  feedback: 'accepted' | 'rejected' | 'ignored';
}