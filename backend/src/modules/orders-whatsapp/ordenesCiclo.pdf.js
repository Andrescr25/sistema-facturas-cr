const PDFDocument=require('pdfkit'),fs=require('node:fs');
const {MARCA,LOGO,LOGO_RATIO,registrarFuentes,fechaLarga}=require('../../utils/marcaPdf');
const {hoyEnCostaRica}=require('../../utils/fechaCR');
const numero=n=>Number(n).toLocaleString('es-CR',{maximumFractionDigits:6});

/** Solo snapshots de la orden: jamás consultar mapeos o cantidades globales. */
function generarPdfOrden(o,{preferirDatosProveedor=true}={}) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'LETTER',margin:38,bufferPages:true,info:{Title:`Orden ${o.referencia}`,Author:'Distribuidora Tachi'}});
    const partes=[];doc.on('data',p=>partes.push(p));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(partes)));
    const f=registrarFuentes(doc),M=38,W=536,limite=717;let y;
    const texto=(t,x,py,w,tam=9,bold=false,color=MARCA.tinta)=>doc.font(bold?f.negrita:f.normal).fontSize(tam).fillColor(color).text(String(t),x,py,{width:w});
    const altura=(t,w,tam=9,bold=false)=>doc.font(bold?f.negrita:f.normal).fontSize(tam).heightOfString(String(t),{width:w});
    const cabecera=()=>{
      if(fs.existsSync(LOGO))doc.image(LOGO,M,28,{width:110,height:110*LOGO_RATIO});
      texto('ORDEN DE COMPRA',300,29,274,14,true,MARCA.naranja);texto(o.referencia,300,52,274,12,true);
      y=83;texto(o.proveedor_nombre,M,y,W,11,true);y+=altura(o.proveedor_nombre,W,11,true)+8;
      texto(`Revisión ${o.version} · Preparada el ${fechaLarga(hoyEnCostaRica())}`,M,y,W,8,false,MARCA.gris);y+=23;
      doc.rect(M,y,W,24).fill(MARCA.naranjaSuave);
      texto('Código',M+6,y+7,82,8,true);texto('Producto',M+100,y+7,269,8,true);
      texto('Cantidad\nproveedor',M+382,y+3,66,7.5,true);texto('Unidades\npropias',M+455,y+3,75,7.5,true);y+=30;
    };
    // Descripciones extensas continúan en otra hoja sin perder texto ni
    // repetir la cantidad como si fuese otra línea de la orden.
    const porcion=(t,disponible)=>{
      if(altura(t,269)<=disponible)return t.length;
      let a=1,b=t.length;
      while(a<b){const medio=Math.ceil((a+b)/2);if(altura(t.slice(0,medio),269)<=disponible)a=medio;else b=medio-1}
      const espacio=t.lastIndexOf(' ',a);return espacio>a/2?espacio+1:a;
    };
    try{
      cabecera();
      for(const l of o.lineas){
        const codigo=(preferirDatosProveedor?l.codigo_proveedor:null)||l.codigo_interno||`P-${l.producto_id}`;
        let descripcion=(preferirDatosProveedor?l.nombre_proveedor:null)||l.producto_nombre;
        descripcion+=`\nProducto propio: ${l.producto_nombre} · P-${l.producto_id}\n1 unidad del proveedor = ${numero(l.factor_conversion)} propias`;
        let primera=true;
        while(descripcion.length){
          const hCodigo=primera?altura(codigo,82,7.5):10;
          if(y+Math.max(hCodigo,35)+12>limite){doc.addPage();cabecera()}
          const n=porcion(descripcion,limite-y-12),parte=descripcion.slice(0,n);
          const h=Math.max(hCodigo,altura(parte,269),35)+12;
          if(primera){texto(codigo,M+6,y+3,82,7.5);texto(numero(l.cantidad_proveedor),M+382,y+3,66,11,true,MARCA.naranjaOscuro);texto(numero(l.cantidad_propia),M+455,y+3,75,9,true)}
          else texto('Continuación',M+6,y+3,82,7.5,false,MARCA.gris);
          texto(parte,M+100,y+3,269);doc.moveTo(M,y+h).lineTo(M+W,y+h).strokeColor(MARCA.linea).stroke();
          y+=h+5;descripcion=descripcion.slice(n);primera=false;
        }
      }
      const paginas=doc.bufferedPageRange().count;
      for(let i=0;i<paginas;i++){doc.switchToPage(i);texto(`${o.referencia} · Distribuidora Tachi`,M,740,390,7,false,MARCA.gris);texto(`${i+1} / ${paginas}`,M+455,740,75,8,false,MARCA.gris)}
      doc.end();
    }catch(e){doc.destroy();reject(e)}
  });
}
module.exports={generarPdfOrden};
