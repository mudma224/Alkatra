import { Module } from '@nestjs/common';

import {
MongooseModule
} from '@nestjs/mongoose';


import {
Recommendation,
RecommendationSchema
}
from './recommendation.schema';


import {
RecommendationRepository
}
from './recommendation.repository';



@Module({

imports:[
MongooseModule.forFeature([
{
 name:Recommendation.name,
 schema:RecommendationSchema
}])],


providers:[RecommendationRepository],
exports:[RecommendationRepository]

})


export class RecommendationModule {}