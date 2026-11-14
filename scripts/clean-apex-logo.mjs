// Remove black corner artifacts from the PNG used in Apex emails and on the site.
// The original committed PNG remains untouched; Vercel runs this at build time.
import {readFileSync,writeFileSync} from "node:fs";
import {inflateSync,deflateSync} from "node:zlib";

const path=process.argv[2]||"public/apex-logo.png";
const input=readFileSync(path);
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
if(!input.subarray(0,8).equals(sig))throw Error("Apex logo is not a PNG");
let off=8,width=0,height=0,depth=0,color=0,interlace=0;
const idats=[];
while(off<input.length){
 const len=input.readUInt32BE(off),type=input.toString("ascii",off+4,off+8);
 const chunk=input.subarray(off+8,off+8+len);
 if(type==="IHDR"){
  width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);
  depth=chunk[8];color=chunk[9];interlace=chunk[12];
 }
 if(type==="IDAT")idats.push(chunk);
 off+=len+12;
 if(type==="IEND")break;
}
if(depth!==8||color!==6||interlace!==0||width<200||height<200)
 throw Error("Unexpected Apex PNG format; refusing to alter asset");
const stride=width*4,raw=inflateSync(Buffer.concat(idats));
if(raw.length!==(stride+1)*height)throw Error("Unexpected PNG row data");
const pixels=Buffer.alloc(stride*height);
let p=0;
for(let y=0;y<height;y++){
 const filter=raw[p++];
 if(filter>4)throw Error("Unsupported PNG filter "+filter);
 for(let x=0;x<stride;x++){
  const a=x>=4?pixels[y*stride+x-4]:0;
  const b=y?pixels[(y-1)*stride+x]:0;
  const c=y&&x>=4?pixels[(y-1)*stride+x-4]:0;
  let pred=0;
  if(filter===1)pred=a;
  else if(filter===2)pred=b;
  else if(filter===3)pred=(a+b)>>1;
  else if(filter===4){
   const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);
   pred=pa<=pb&&pa<=pc?a:pb<=pc?b:c;
  }
  pixels[y*stride+x]=(raw[p++]+pred)&255;
 }
}
// The mark occupies the center. Only the empty upper side zones are targeted.
// Preserve the pink/silver detail and every pixel outside the corner zones.
let changed=0;
const maxY=Math.floor(height*.34),leftMax=Math.floor(width*.285),rightMin=Math.floor(width*.79);
for(let y=0;y<maxY;y++){
 for(let x=0;x<width;x++){
  if(x>=leftMax&&x<=rightMin)continue;
  const i=y*stride+x*4;
  if(pixels[i]<=20&&pixels[i+1]<=20&&pixels[i+2]<=20&&pixels[i+3]>=245){
   pixels[i+3]=0;changed++;
  }
 }
}
const scanlines=Buffer.alloc((stride+1)*height);
for(let y=0;y<height;y++)pixels.copy(scanlines,y*(stride+1)+1,y*stride,(y+1)*stride);
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){
 let c=n;
 for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
 crcTable[n]=c>>>0;
}
function chunk(type,data){
 const t=Buffer.from(type,"ascii"),out=Buffer.alloc(12+data.length);
 out.writeUInt32BE(data.length,0);t.copy(out,4);data.copy(out,8);
 let crc=0xffffffff;
 for(let i=4;i<8+data.length;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
 out.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length);
 return out;
}
const ihdr=Buffer.alloc(13);
ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
const output=Buffer.concat([sig,chunk("IHDR",ihdr),chunk("IDAT",deflateSync(scanlines,{level:9})),chunk("IEND",Buffer.alloc(0))]);
writeFileSync(path,output);
console.log("Apex logo: "+changed+" opaque black corner pixels removed ("+width+"x"+height+").");
