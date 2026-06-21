import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
 Recommendation,
 RecommendationDocument
} from './recommendation.schema';

import {
 CreateRecommendationDto
} from './dto/create-recommendation.dto';



@Injectable()
export class RecommendationRepository {


constructor(

@InjectModel(Recommendation.name)

private readonly model:
Model<RecommendationDocument>

){}



async saveRecommendation(
data:CreateRecommendationDto
){

return this.model.create(data);

}




async findByParcelId(
parcelId:string,
limit:number=10
){

return this.model
.find({
parcel_id:parcelId
})
.sort({
createdAt:-1
})
.limit(limit)
.exec();

}


}