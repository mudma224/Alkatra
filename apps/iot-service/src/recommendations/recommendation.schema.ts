import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';


export type RecommendationDocument = Recommendation & Document;


@Schema({
  collection: 'recommendations',
  timestamps: true
})
export class Recommendation {


  @Prop({
    required: true,
    index:true
  })
  parcel_id: string;


  @Prop()
  farm_id?: string;


  @Prop({
    required:true
  })
  irrigate:boolean;



  @Prop()
  confidence_score?:number;



  @Prop()
  quantity_mm?:number;



  @Prop()
  reason_code?:string;



  @Prop()
  explanation_fr?:string;



  @Prop()
  explanation_darija?:string;



  @Prop()
  model_version?:string;



  @Prop()
  sensor_ts?:Date;


}


export const RecommendationSchema =
SchemaFactory.createForClass(Recommendation);