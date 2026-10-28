// World-coordinate tiles: never silently shrink teaching material to fit one page.
export function exportRegion(bounds, padding = 40) {
  if (!bounds) throw Error('В выбранной области нет объектов');
  return {x:bounds.x-padding,y:bounds.y-padding,w:bounds.w+padding*2,h:bounds.h+padding*2};
}
export function pngSize(region, scale=2) {
  const width=Math.ceil(region.w*scale),height=Math.ceil(region.h*scale);
  if (![width,height,scale].every(Number.isFinite)||scale<=0||width<1||height<1||width>8192||height>8192||width*height>16000000)
    throw Error('PNG ограничен 16 млн пикселей и 8192 px по стороне. Выберите меньшую область, масштаб 1× или PDF по страницам.');
  return {width,height,scale};
}
export function pageTiles(region, size=1) {
  if (![.75,1,1.5,2].includes(size)) throw Error('Неверный масштаб печати');
  const w=1000/size,h=650/size,cols=Math.ceil(region.w/w),rows=Math.ceil(region.h/h);
  if(cols*rows>32) throw Error(`Получается ${cols*rows} страниц. Максимум 32 за один экспорт: выделите часть доски.`);
  return Array.from({length:cols*rows},(_,i)=>({x:region.x+(i%cols)*w,y:region.y+Math.floor(i/cols)*h,w,h}));
}
