import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePhotoManifest } from '../scripts/photos';
import type { Waypoint } from '../src/features/map/model';

const waypoint: Waypoint = {id:'wpt-1',name:'Camp',description:'Existing note',symbol:'',type:'',kind:'camp',lon:-73,lat:42,elevation:null,time:null};
const trips = new Map([['trip-one',[waypoint]]]);
const photo = {id:'trip-one-camp-01',waypointId:'wpt-1',src:'/photos/trip-one/camp-01.webp',width:1600,height:1067,alt:'Tent beside a lake',caption:'Evening at camp.',order:1};

test('photo manifest accepts waypoint photos, explicit photo stops, and optional responsive variants',async()=>{
 const value={schemaVersion:1,trips:{'trip-one':{stops:[{id:'creek',name:'Creek crossing',description:'Between camps',kind:'photo',lon:-72.9,lat:42.1,elevation:null,time:null}],photos:[photo,{id:'trip-one-creek-01',stopId:'creek',src:'/photos/trip-one/creek.webp',thumbnailSrc:'/photos/trip-one/creek-thumb.webp',variants:[{src:'/photos/trip-one/creek-2400.webp',width:2400,height:1600}],width:2400,height:1600,alt:'Creek crossing',caption:'Broad stones.',order:2}]}}};
 const result=await validatePhotoManifest(value,trips,false);
 assert.equal(result.trips['trip-one'].photos.length,2);
 assert.equal(result.trips['trip-one'].stops[0].name,'Creek crossing');
});

test('photo manifest rejects invalid references, duplicate IDs, coordinates, ambiguous associations, and missing assets',async()=>{
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{missing:{stops:[],photos:[]}}},trips,false),/unknown trip/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[],photos:[{...photo,waypointId:'missing'}]}}},trips,false),/unknown waypointId/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[{id:'bad',name:'Bad',description:'',kind:'photo',lon:200,lat:42,elevation:null,time:null}],photos:[]}}},trips,false),/invalid photo stop coordinates/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[{id:'wpt-1',name:'Collision',description:'',kind:'photo',lon:-73,lat:42,elevation:null,time:null}],photos:[]}}},trips,false),/waypoint-colliding/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[{id:'creek',name:'Creek',description:'',kind:'photo',lon:-73,lat:42,elevation:null,time:null}],photos:[{...photo,stopId:'creek'}]}}},trips,false),/exactly one/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[],photos:[photo,{...photo,order:2}]}}},trips,false),/duplicate photo ID/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[],photos:[{...photo,src:42}]}}},trips,false),/src, positive dimensions/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[],photos:[{...photo,variants:'large'}]}}},trips,false),/variants must be an array/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[],photos:[{...photo,credit:42}]}}},trips,false),/capturedAt and credit/);
 await assert.rejects(validatePhotoManifest({schemaVersion:1,trips:{'trip-one':{stops:[],photos:[{...photo,src:'/definitely-missing.webp'}]}}},trips),/missing photo asset/);
});
