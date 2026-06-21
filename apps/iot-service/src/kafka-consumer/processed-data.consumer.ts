import {
Injectable,
OnModuleInit,
Logger
} from '@nestjs/common';


import { KafkaService } from '../kafka/kafka.service';


import {
RecommendationRepository
}
from '../recommendations/recommendation.repository';



@Injectable()
export class ProcessedDataConsumer
implements OnModuleInit{


private readonly logger =
new Logger(
ProcessedDataConsumer.name
);



constructor(

private readonly kafkaService:KafkaService,


private readonly recommendationRepository:
RecommendationRepository


){}



async onModuleInit(){


await this.kafkaService.subscribe(

'processed-sensor-data',

async(message)=>{


try{


const features =
JSON.parse(
message.value.toString()
);



const prediction =
await this.callML(features);



await this.recommendationRepository
.saveRecommendation({

parcel_id:
features.parcel_id,


farm_id:
features.farm_id,



...prediction,


sensor_ts:
new Date(features.timestamp)

});



}

catch(error){

this.logger.error(
'Erreur processed-data',
error
);

}


}


);



}




private async callML(features:any){


const response =
await fetch(

`${process.env.ML_INFERENCE_URL}/api/v1/predict`,

{

method:'POST',

headers:{
'Content-Type':
'application/json'
},


body:
JSON.stringify(features)

}

);



if(!response.ok){

throw new Error(
'ML service indisponible'
);

}


return response.json();


}



}