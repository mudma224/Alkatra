db = db.getSiblingDB("alkatra_db");


db.recommendations.createIndex(
{
parcel_id:1
}
);


db.recommendations.createIndex(
{
created_at:-1
}
);