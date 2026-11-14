import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {deflateSync,inflateSync} from "node:zlib";

const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function chunk(type,data){
 const out=Buffer.alloc(12+data.length);
 out.writeUInt32BE(data.length,0);out.write(type,4,"ascii");data.copy(out,8);
 let crc=0xffffffff;
 for(let i=4;i<8+data.length;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
 out.writeUInt32BE((crc^0xffffffff)>>>0,8+data.length);return out;
}
function makePng(){
 const w=320,h=240,stride=w*4,row=Buffer.alloc((stride+1)*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=y*(stride+1)+1+x*4;
  const black=(x<92||x>252)&&y<80;
  const center=x===160&&y===20;
  const outside=x===10&&y===200;
  if(black||outside){row[p+3]=255;}
  else if(center){row[p]=230;row[p+2]=100;row[p+3]=255;}
 }
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(row)),chunk("IEND",Buffer.alloc(0))]);
}
function getPixels(png){
 let p=8,data=[];while(p<png.length){const n=png.readUInt32BE(p),kind=png.toString("ascii",p+4,p+8);
 if(kind==="IDAT")data.push(png.subarray(p+8,p+8+n));p+=n+12;}
 const raw=inflateSync(Buffer.concat(data));const w=320,out=Buffer.alloc(w*4*240);
 for(let y=0;y<240;y++){assert.equal(raw[y*(w*4+1)],0);raw.copy(out,y*w*4,y*(w*4+1)+1,y*(w*4+1)+1+w*4);}
 return (x,y)=>[...out.subarray((y*w+x)*4,(y*w+x)*4+4)];
}
test("email logo corners become transparent without changing the mark",()=>{
 const dir=mkdtempSync(join(tmpdir(),"apex-email-logo-")),file=join(dir,"logo.png");
 try{
  writeFileSync(file,makePng());
  execFileSync(process.execPath,["scripts/clean-apex-logo.mjs",file],{stdio:"pipe"});
  const pix=getPixels(readFileSync(file));
  assert.deepEqual(pix(10,10),[0,0,0,0]);
  assert.deepEqual(pix(300,10),[0,0,0,0]);
  assert.deepEqual(pix(160,20),[230,0,100,255]);
  assert.deepEqual(pix(10,200),[0,0,0,255]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
