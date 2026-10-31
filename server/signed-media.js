import crypto from 'node:crypto';
export async function storeSignedObject(bucket,{buffer,mimeType,userId,kind='image',expiresMs=60*60*1000}={}){
  const ownerHash=crypto.createHash('sha256').update(String(userId)).digest('hex'),path=`pothub-private/${ownerHash}/${kind}/${crypto.randomUUID()}`,file=bucket.file(path),bytes=Buffer.from(buffer);
  await file.save(bytes,{resumable:false,metadata:{contentType:mimeType,cacheControl:'private, no-store',metadata:{ownerHash,kind}}});
  const [url]=await file.getSignedUrl({version:'v4',action:'read',expires:Date.now()+expiresMs});return {path,url,mimeType,size:bytes.length};
}
export async function signStoredObject(bucket,path,{expiresMs=60*60*1000}={}){
  if(!String(path||'').startsWith('pothub-private/'))throw new Error('Stored media reference is invalid.');
  const [url]=await bucket.file(path).getSignedUrl({version:'v4',action:'read',expires:Date.now()+expiresMs});return url;
}
