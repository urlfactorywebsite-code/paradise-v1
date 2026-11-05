'use strict';
const crypto=require('node:crypto');
const sharp=require('sharp');
const MAX_LOGO_BYTES=300000;
const fail=message=>{throw Object.assign(new Error(message),{status:422});};
async function normalizeLogo(dataUrl) {
 if(typeof dataUrl!=='string'||dataUrl.length>Math.ceil(MAX_LOGO_BYTES/3)*4+100)fail('Choose a PNG, JPEG or WebP logo up to 300 KB.');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
 if(!match)fail('Only embedded PNG, JPEG and WebP logos are supported.');
 const content=Buffer.from(match[2],'base64');
 if(!content.length||content.length>MAX_LOGO_BYTES||content.toString('base64')!==match[2])fail('Invalid logo data or logo exceeds 300 KB.');
 const png=content.length>=24&&content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=content.length>=4&&content[0]===255&&content[1]===216&&content[2]===255;
 const webp=content.length>=20&&content.toString('ascii',0,4)==='RIFF'&&content.toString('ascii',8,12)==='WEBP'&&content.readUInt32LE(4)+8===content.length;
 const format=png?'png':jpeg?'jpeg':webp?'webp':null;
 if(format!==match[1])fail('Logo content does not match its PNG, JPEG or WebP signature.');
 // APNG is not a supported static logo; do not silently select one frame.
 if(png){let offset=8;while(offset+12<=content.length){const length=content.readUInt32BE(offset);if(length>content.length-offset-12)fail('Invalid PNG logo.');if(content.toString('ascii',offset+4,offset+8)==='acTL')fail('Animated logos are not supported.');offset+=length+12;}}
 try {
  const image=sharp(content,{failOn:'warning',limitInputPixels:4096*4096});
  const meta=await image.metadata();
  if(meta.format!==format||!meta.width||!meta.height||meta.width>4096||meta.height>4096||(meta.pages||1)>1)fail('Use a static raster logo up to 4096 pixels per side.');
  // Decoding and re-encoding strips metadata and any appended executable payload.
  const {data,info}=await image.rotate().resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').png({compressionLevel:9}).toBuffer({resolveWithObject:true});
  if(data.length>2097152)fail('Normalized logo is too large.');
  return {content:data,mime:'image/png',width:info.width,height:info.height,sha256:crypto.createHash('sha256').update(data).digest('hex')};
 }catch(error){if(error.status===422)throw error;fail('The logo could not be decoded. Choose a valid static PNG, JPEG or WebP.');}
}
module.exports={normalizeLogo,MAX_LOGO_BYTES};
