const PDFDocument=require('pdfkit'),fs=require('node:fs');
const {MARCA,LOGO,LOGO_RATIO,registrarFuentes}=require('../../utils/marcaPdf');
const n=v=>Number(v).toLocaleString('es-CR',{maximumFractionDigits:6});
/** Es una representación de los datos revisados, nunca el original fiscal.
 * No reconstruye el total desde líneas ni pretende recuperar XML ausente. */
function generarRepresentacion(v){return new Promise((resolve,reject)=>{
  const f=v.documento,doc=new PDFDocument({size:'LETTER',margin:38,bufferPages:true,info:{Title:`Representación ${f.numero_consecutivo}`,Author:'Distribuidora Tachi'}}),partes=[];
  doc.on('data',p=>partes.push(p));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(partes)));
  const fuentes=registrarFuentes(doc),W=536,M=38,L=712;let y;
  const alto=(t,w,tam=9)=>doc.font(fuentes.normal).fontSize(tam).heightOfString(String(t),{width:w});
  const texto=(t,x,py,w,tam=9,bold=false,color=MARCA.tinta)=>doc.font(bold?fuentes.negrita:fuentes.normal).fontSize(tam).fillColor(color).text(String(t),x,py,{width:w});
  const cabecera=()=>{
    if(fs.existsSync(LOGO))doc.image(LOGO,M,28,{width:105,height:105*LOGO_RATIO});
    texto('REPRESENTACIÓN DE FACTURA',244,29,330,12,true,MARCA.naranja);
    y=75;texto('Datos registrados en el sistema. No es el PDF original del proveedor.',M,y,W,9,true,MARCA.naranjaOscuro);y+=25;
    texto(f.proveedor_nombre,M,y,W,10,true);y+=alto(f.proveedor_nombre,W,10)+8;
    texto(`Factura ${f.numero_consecutivo} · ${f.fecha_emision.slice(0,10)} · ${f.moneda}`,M,y,W,9);y+=alto(`Factura ${f.numero_consecutivo} · ${f.fecha_emision.slice(0,10)} · ${f.moneda}`,W)+8;
    texto(`Clave: ${f.clave}`,M,y,W,8);y+=20;
    doc.rect(M,y,W,24).fill(MARCA.naranjaSuave);texto('Código',M+6,y+7,74,8,true);texto('Descripción',M+90,y+7,260,8,true);texto('Cantidad',M+366,y+7,66,8,true);texto('Total línea',M+446,y+7,84,8,true);y+=31;
  };
  const porcion=(t,h)=>{if(alto(t,260)<=h)return t.length;let a=1,b=t.length;while(a<b){const m=Math.ceil((a+b)/2);if(alto(t.slice(0,m),260)<=h)a=m;else b=m-1}const espacio=t.lastIndexOf(' ',a);return espacio>a/2?espacio+1:a};
  try{cabecera();for(const l of v.lineas){let restante=l.descripcion||'Sin descripción',primera=true;
    while(restante){const codigo=l.codigo_proveedor||'Sin código',hc=primera?alto(codigo,74,7.5):10;
      if(y+Math.max(hc,35)+12>L){doc.addPage();cabecera()}
      const c=porcion(restante,L-y-12),p=restante.slice(0,c),h=Math.max(alto(p,260),hc,35)+12;
      texto(primera?codigo:'Continuación',M+6,y+3,74,7.5);texto(p,M+90,y+3,260);
      if(primera){texto(n(l.cantidad),M+366,y+3,66,9,true);texto(n(l.total_linea),M+446,y+3,84,9,true)}
      doc.moveTo(M,y+h).lineTo(M+W,y+h).strokeColor(MARCA.linea).stroke();y+=h+5;restante=restante.slice(c);primera=false;
    }
  }
  if(y+42>L){doc.addPage();cabecera()}texto(`Total del comprobante: ${f.moneda} ${n(f.total_factura)}`,M,y+8,W,11,true,MARCA.naranjaOscuro);
  const count=doc.bufferedPageRange().count;for(let i=0;i<count;i++){doc.switchToPage(i);texto('Representación del buzón · No confirma recepción física',M,741,430,7,false,MARCA.gris);texto(`${i+1} / ${count}`,M+455,741,75,8,false,MARCA.gris)}doc.end();
  }catch(e){doc.destroy();reject(e)}
})}
module.exports={generarRepresentacion};
