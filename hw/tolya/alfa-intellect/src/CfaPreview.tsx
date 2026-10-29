import { PublicNavigation } from "./PublicNavigation";
import { ArrowLeft, ArrowUpRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Brand, Button } from "./ui";
import { SideRail } from "./SideRail";

export const cfaExamples = [
  {name:"Производство · демо 01",sector:"Оборотный капитал",rate:"18,4%",term:"12 мес.",volume:"50 млн ₽"},
  {name:"Логистика · демо 02",sector:"Развитие бизнеса",rate:"17,8%",term:"6 мес.",volume:"25 млн ₽"},
  {name:"Торговля · демо 03",sector:"Закупка товаров",rate:"19,2%",term:"18 мес.",volume:"80 млн ₽"},
];
export function CfaPreview({go}:{go(path:string):void}) {
  const team=()=>go("/about#team");
  return <div className="cfa-page"><header className="public-header"><button className="unstyled" onClick={()=>go("/")}><Brand/></button><button className="cabinet-return" onClick={()=>go("/#roadmap")}><ArrowLeft size={16}/>К продуктам</button><SideRail/></header>
      <PublicNavigation go={go} current="/cfa"/>
    <main className="cfa-terminal"><header className="cfa-heading"><div><span className="eyebrow">ЦИФРОВЫЕ ФИНАНСОВЫЕ АКТИВЫ</span><h1>Капитал для следующего шага.</h1><p>Выпуски, графики и портфель в одном пространстве бизнеса.</p></div><span className="future-status">В активной разработке</span></header>
      <div className="cfa-demo-note"><b>Превью интерфейса · демонстрационные данные</b><span>Выпуски, ставки, цены и график вымышлены. Операции недоступны. Кнопки будущих функций открывают команду продукта.</span></div>
      <nav className="cfa-tabs" aria-label="Возможности ЦФА"><button onClick={team}>Рынок выпусков</button><button onClick={team}>Мой портфель</button><button onClick={team}>Мои выпуски</button><Button onClick={team}><Plus size={17}/>Создать выпуск</Button></nav>
      <div className="cfa-terminal-grid"><section className="cfa-chart-panel"><header><div><small>УСЛОВНЫЙ ВЫПУСК · ДЕМО 01</small><h2>Производство</h2></div><button className="cfa-tool" aria-label="Настройки графика: познакомиться с командой" onClick={team}><SlidersHorizontal size={18}/></button></header><div className="cfa-quote"><strong>1 004,50 ₽</strong><span>Условная цена · пример</span></div><div className="cfa-periods">{["День","Неделя","Месяц","Год"].map(label=><button key={label} onClick={team}>{label}</button>)}</div>
        <svg className="cfa-price-chart" viewBox="0 0 720 250" role="img" aria-label="Демонстрационный график условной цены, не рыночные котировки"><g className="cfa-chart-grid">{[30,80,130,180,230].map(y=><path key={y} d={`M0 ${y}H720`}/>)}</g>{[105,120,110,140,150,138,165,175,155,185,195,210,190,220,232,218,240,254,242,272,285,278,301,315].map((value,i)=><g key={i} className={i%4===1?"cfa-candle-down":"cfa-candle-up"}><path d={`M${18+i*29} ${235-value*.64-12}v38`}/><rect x={11+i*29} y={235-value*.64} width="14" height={i%3===0?19:11} rx="2"/></g>)}</svg><footer><span>Начало периода</span><span>Учебный ряд данных</span><span>Конец периода</span></footer>
      </section><aside className="cfa-watchlist"><header><h2>Лист наблюдения</h2><button className="cfa-tool" aria-label="Поиск выпусков: познакомиться с командой" onClick={team}><Search size={18}/></button></header>{cfaExamples.map(item=><button className="cfa-watch-row" key={item.name} onClick={team}><span><b>{item.name}</b><small>{item.sector}</small></span><strong>{item.rate}<small>Условная ставка</small></strong></button>)}<section className="cfa-portfolio"><span className="eyebrow">ПРИМЕР ПОРТФЕЛЯ</span><h3>Соберите свою картину капитала</h3><p>Здесь появятся активы, сроки и события по вашим выпускам.</p><Button secondary onClick={team}>Открыть портфель<ArrowUpRight size={16}/></Button></section></aside></div>
      <section className="cfa-issues"><header><h2>Витрина выпусков</h2><button className="text-button" onClick={team}>Все выпуски<ArrowUpRight size={15}/></button></header><div className="cfa-table-scroll"><table><thead><tr><th>Выпуск</th><th>Условная ставка</th><th>Срок</th><th>Объём примера</th><th><span className="visually-hidden">Действие</span></th></tr></thead><tbody>{cfaExamples.map(item=><tr key={item.name}><th scope="row">{item.name}<small>{item.sector}</small></th><td>{item.rate}</td><td>{item.term}</td><td>{item.volume}</td><td><button className="text-button" onClick={team}>Посмотреть<ArrowUpRight size={15}/></button></td></tr>)}</tbody></table></div></section>
      <footer className="cfa-disclosure">Концепт будущего продукта Альфы и Омеги. Демонстрация интерфейса, не предложение финансовых инструментов.</footer>
    </main></div>;
}
