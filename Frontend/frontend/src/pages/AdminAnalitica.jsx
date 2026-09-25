import { useCallback, useState } from 'react';
import { BarChart3, ChevronDown, Database, Lightbulb, RefreshCw, Table2 } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import RequestState from '../components/RequestState';
import { isDemo } from '../services/api';
import { analiticaService } from '../services/analiticaService';
import { money } from '../utils/format';

const number = value => {
  const parsed = Number(value);
  return value === '' || value == null || !Number.isFinite(parsed)
    ? '—'
    : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(parsed);
};
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const sum = (rows, key) => rows.reduce((total, row) => total + safeNumber(row[key]), 0);
const uniqueCount = (rows, key) => new Set(rows.map(row => row[key]).filter(value => value != null && value !== '')).size;
const leader = (rows, key) => rows.reduce((best, row) => safeNumber(row[key]) > safeNumber(best?.[key]) ? row : best, null);
const percent = value => `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value)}%`;

const reports = [
  {
    id: 'ticket-promedio', label: 'Ticket promedio', description: 'Compara el importe medio de las órdenes confirmadas entre ciudades.',
    columns: [
      { key: 'ciudad', label: 'Ciudad' },
      { key: 'ticket_promedio', label: 'Ticket promedio', format: money },
      { key: 'total_ordenes', label: 'Órdenes', format: number },
    ],
    chart: 'ticket_promedio', chartFormat: money, chartTitle: 'Comparación de ticket por ciudad',
    chartLabel: row => row.ciudad || 'Sin ciudad', secondary: row => `${number(row.total_ordenes)} órdenes`,
  },
  {
    id: 'productos-mas-vendidos', label: 'Productos más vendidos', description: 'Prioriza los productos por volumen y muestra el ingreso que aporta cada uno.',
    columns: [
      { key: 'nombre', label: 'Producto' },
      { key: 'unidades_vendidas', label: 'Unidades', format: number },
      { key: 'ingresos', label: 'Ingresos', format: money },
    ],
    chart: 'unidades_vendidas', chartFormat: number, chartTitle: 'Ranking de productos',
    chartLabel: row => row.nombre || 'Sin producto', secondary: row => money(row.ingresos),
  },
  {
    id: 'ventas-por-categoria', label: 'Ventas por categoría', description: 'Sigue la evolución mensual de las categorías con mayor ingreso acumulado.',
    columns: [
      { key: 'categoria', label: 'Categoría' },
      { key: 'mes', label: 'Mes' },
      { key: 'ingresos', label: 'Ingresos', format: money },
    ],
    chart: 'ingresos', chartFormat: money, chartTitle: 'Evolución de ingresos', chartType: 'trend',
    chartLabel: row => `${row.categoria || 'Sin categoría'} · ${row.mes || 'Sin mes'}`,
  },
  {
    id: 'ventas-por-ciudad', label: 'Ventas por ciudad', description: 'Compara ingresos y órdenes confirmadas por ubicación.',
    columns: [
      { key: 'ciudad', label: 'Ciudad' },
      { key: 'total_ordenes', label: 'Órdenes', format: number },
      { key: 'ingresos', label: 'Ingresos', format: money },
    ],
    chart: 'ingresos', chartFormat: money, chartTitle: 'Participación de ingresos por ciudad',
    chartLabel: row => row.ciudad || 'Sin ciudad', secondary: row => `${number(row.total_ordenes)} órdenes`,
  },
  {
    id: 'calificacion-vs-ventas', label: 'Calificación y ventas', description: 'Agrupa los productos por calificación para hacer legible su nivel de ventas.',
    columns: [
      { key: 'nombre', label: 'Producto' },
      { key: 'calificacion_promedio', label: 'Calificación', format: number },
      { key: 'unidades_vendidas', label: 'Unidades', format: number },
    ],
    chart: 'unidades_vendidas', chartFormat: number, chartTitle: 'Ventas promedio por rango de calificación', chartType: 'rating-bands',
    chartLabel: row => row.nombre || 'Sin producto',
  },
  {
    id: 'clientes-frecuentes', label: 'Clientes frecuentes', description: 'Identifica recurrencia de compra y gasto acumulado entre los clientes del ranking.',
    columns: [
      { key: 'nombre', label: 'Cliente' },
      { key: 'email', label: 'Correo' },
      { key: 'total_ordenes', label: 'Órdenes', format: number },
      { key: 'gasto_total', label: 'Gasto total', format: money },
    ],
    chart: 'total_ordenes', chartFormat: number, chartTitle: 'Ranking de recurrencia',
    chartLabel: row => row.nombre || row.email || 'Sin cliente', secondary: row => money(row.gasto_total),
  },
];

const PREVIEW_DATA = {
  'ticket-promedio': [
    { ciudad: 'Lima', ticket_promedio: 482.7, total_ordenes: 164 },
    { ciudad: 'Arequipa', ticket_promedio: 436.2, total_ordenes: 58 },
    { ciudad: 'Cusco', ticket_promedio: 391.5, total_ordenes: 47 },
    { ciudad: 'Trujillo', ticket_promedio: 365.8, total_ordenes: 43 },
    { ciudad: 'Piura', ticket_promedio: 344.1, total_ordenes: 36 },
  ],
  'productos-mas-vendidos': [
    { nombre: 'Set de dormitorio algodón', unidades_vendidas: 126, ingresos: 27642 },
    { nombre: 'Cafetera programable 1.5 L', unidades_vendidas: 112, ingresos: 36960 },
    { nombre: 'Zapatillas urbanas unisex', unidades_vendidas: 98, ingresos: 21560 },
    { nombre: 'Silla ergonómica de oficina', unidades_vendidas: 84, ingresos: 57960 },
    { nombre: 'Set de cuidado facial', unidades_vendidas: 79, ingresos: 14220 },
    { nombre: 'Mochila impermeable', unidades_vendidas: 72, ingresos: 12240 },
  ],
  'ventas-por-categoria': [
    { categoria: 'Hogar', mes: '2026-04', ingresos: 28200 }, { categoria: 'Hogar', mes: '2026-05', ingresos: 31600 },
    { categoria: 'Hogar', mes: '2026-06', ingresos: 29400 }, { categoria: 'Hogar', mes: '2026-07', ingresos: 35800 },
    { categoria: 'Hogar', mes: '2026-08', ingresos: 38200 }, { categoria: 'Hogar', mes: '2026-09', ingresos: 41100 },
    { categoria: 'Moda', mes: '2026-04', ingresos: 19600 }, { categoria: 'Moda', mes: '2026-05', ingresos: 22700 },
    { categoria: 'Moda', mes: '2026-06', ingresos: 25100 }, { categoria: 'Moda', mes: '2026-07', ingresos: 23800 },
    { categoria: 'Moda', mes: '2026-08', ingresos: 27600 }, { categoria: 'Moda', mes: '2026-09', ingresos: 30200 },
    { categoria: 'Tecnología', mes: '2026-04', ingresos: 24100 }, { categoria: 'Tecnología', mes: '2026-05', ingresos: 27900 },
    { categoria: 'Tecnología', mes: '2026-06', ingresos: 26800 }, { categoria: 'Tecnología', mes: '2026-07', ingresos: 32100 },
    { categoria: 'Tecnología', mes: '2026-08', ingresos: 34400 }, { categoria: 'Tecnología', mes: '2026-09', ingresos: 33700 },
    { categoria: 'Bienestar', mes: '2026-04', ingresos: 12800 }, { categoria: 'Bienestar', mes: '2026-05', ingresos: 15400 },
    { categoria: 'Bienestar', mes: '2026-06', ingresos: 17300 }, { categoria: 'Bienestar', mes: '2026-07', ingresos: 16900 },
    { categoria: 'Bienestar', mes: '2026-08', ingresos: 19100 }, { categoria: 'Bienestar', mes: '2026-09', ingresos: 21800 },
  ],
  'ventas-por-ciudad': [
    { ciudad: 'Lima', total_ordenes: 164, ingresos: 79162.8 },
    { ciudad: 'Arequipa', total_ordenes: 58, ingresos: 25300 },
    { ciudad: 'Cusco', total_ordenes: 47, ingresos: 18400.5 },
    { ciudad: 'Trujillo', total_ordenes: 43, ingresos: 15729.4 },
    { ciudad: 'Piura', total_ordenes: 36, ingresos: 12387.6 },
  ],
  'calificacion-vs-ventas': [
    { nombre: 'Producto A', calificacion_promedio: 4.8, unidades_vendidas: 126 }, { nombre: 'Producto B', calificacion_promedio: 4.7, unidades_vendidas: 98 },
    { nombre: 'Producto C', calificacion_promedio: 4.4, unidades_vendidas: 112 }, { nombre: 'Producto D', calificacion_promedio: 4.2, unidades_vendidas: 84 },
    { nombre: 'Producto E', calificacion_promedio: 4.1, unidades_vendidas: 79 }, { nombre: 'Producto F', calificacion_promedio: 3.9, unidades_vendidas: 68 },
    { nombre: 'Producto G', calificacion_promedio: 3.7, unidades_vendidas: 73 }, { nombre: 'Producto H', calificacion_promedio: 3.5, unidades_vendidas: 54 },
    { nombre: 'Producto I', calificacion_promedio: 3.3, unidades_vendidas: 61 }, { nombre: 'Producto J', calificacion_promedio: 3.1, unidades_vendidas: 47 },
    { nombre: 'Producto K', calificacion_promedio: 2.8, unidades_vendidas: 39 }, { nombre: 'Producto L', calificacion_promedio: 2.5, unidades_vendidas: 33 },
    { nombre: 'Producto M', calificacion_promedio: 2.2, unidades_vendidas: 28 }, { nombre: 'Producto N', calificacion_promedio: 1.8, unidades_vendidas: 18 },
    { nombre: 'Producto O', calificacion_promedio: 1.4, unidades_vendidas: 12 }, { nombre: 'Producto P', calificacion_promedio: 0, unidades_vendidas: 21 },
  ],
  'clientes-frecuentes': [
    { nombre: 'Cliente 1042', email: 'cliente1042@ejemplo.pe', total_ordenes: 9, gasto_total: 4280 },
    { nombre: 'Cliente 0871', email: 'cliente0871@ejemplo.pe', total_ordenes: 8, gasto_total: 3910 },
    { nombre: 'Cliente 1138', email: 'cliente1138@ejemplo.pe', total_ordenes: 7, gasto_total: 3460 },
    { nombre: 'Cliente 0925', email: 'cliente0925@ejemplo.pe', total_ordenes: 7, gasto_total: 2980 },
    { nombre: 'Cliente 1204', email: 'cliente1204@ejemplo.pe', total_ordenes: 6, gasto_total: 2740 },
    { nombre: 'Cliente 0763', email: 'cliente0763@ejemplo.pe', total_ordenes: 5, gasto_total: 2310 },
  ],
};

function getRatingBands(rows) {
  const definitions = [
    { label: 'Sin calificación', test: value => value <= 0 },
    { label: '1.0 – 1.9', test: value => value >= 1 && value < 2 },
    { label: '2.0 – 2.9', test: value => value >= 2 && value < 3 },
    { label: '3.0 – 3.9', test: value => value >= 3 && value < 4 },
    { label: '4.0 – 5.0', test: value => value >= 4 },
  ];
  return definitions.map(band => {
    const products = rows.filter(row => band.test(safeNumber(row.calificacion_promedio)));
    return { label: band.label, count: products.length, value: products.length ? sum(products, 'unidades_vendidas') / products.length : 0 };
  }).filter(band => band.count > 0);
}

function buildMetrics(report, rows) {
  const top = leader(rows, report.chart);
  switch (report.id) {
    case 'ticket-promedio': {
      const orders = sum(rows, 'total_ordenes');
      const weighted = orders > 0 ? rows.reduce((total, row) => total + safeNumber(row.ticket_promedio) * safeNumber(row.total_ordenes), 0) / orders : 0;
      return [
        { label: 'Ticket ponderado', value: money(weighted), note: 'Ponderado por número de órdenes' },
        { label: 'Órdenes analizadas', value: number(orders), note: `${number(rows.length)} ciudades con datos` },
        { label: 'Mayor ticket', value: top?.ciudad || '—', note: top ? money(top.ticket_promedio) : 'Sin datos' },
      ];
    }
    case 'productos-mas-vendidos':
      return [
        { label: 'Unidades vendidas', value: number(sum(rows, 'unidades_vendidas')), note: `${number(rows.length)} productos en el ranking` },
        { label: 'Ingresos', value: money(sum(rows, 'ingresos')), note: 'Ventas confirmadas consultadas' },
        { label: 'Producto líder', value: top?.nombre || '—', note: top ? `${number(top.unidades_vendidas)} unidades` : 'Sin datos' },
      ];
    case 'ventas-por-categoria': {
      const totals = [...new Set(rows.map(row => row.categoria))].map(categoria => ({ categoria, ingresos: sum(rows.filter(row => row.categoria === categoria), 'ingresos') }));
      const categoryTop = leader(totals, 'ingresos');
      return [
        { label: 'Ingresos del periodo', value: money(sum(rows, 'ingresos')), note: `${number(uniqueCount(rows, 'mes'))} meses disponibles` },
        { label: 'Categorías activas', value: number(uniqueCount(rows, 'categoria')), note: 'Con ventas registradas' },
        { label: 'Categoría líder', value: categoryTop?.categoria || '—', note: categoryTop ? money(categoryTop.ingresos) : 'Sin datos' },
      ];
    }
    case 'ventas-por-ciudad':
      return [
        { label: 'Ingresos', value: money(sum(rows, 'ingresos')), note: `${number(rows.length)} ciudades con ventas` },
        { label: 'Órdenes', value: number(sum(rows, 'total_ordenes')), note: 'Ventas confirmadas consultadas' },
        { label: 'Ciudad líder', value: top?.ciudad || '—', note: top ? money(top.ingresos) : 'Sin datos' },
      ];
    case 'calificacion-vs-ventas': {
      const rated = rows.filter(row => safeNumber(row.calificacion_promedio) > 0);
      const average = rated.length ? sum(rated, 'calificacion_promedio') / rated.length : 0;
      return [
        { label: 'Calificación media', value: average ? `${number(average)} / 5` : '—', note: `${number(rated.length)} productos calificados` },
        { label: 'Unidades vendidas', value: number(sum(rows, 'unidades_vendidas')), note: `${number(rows.length)} productos analizados` },
        { label: 'Más vendido', value: top?.nombre || '—', note: top ? `${number(top.unidades_vendidas)} unidades` : 'Sin datos' },
      ];
    }
    case 'clientes-frecuentes':
      return [
        { label: 'Gasto acumulado', value: money(sum(rows, 'gasto_total')), note: `${number(rows.length)} clientes en el ranking` },
        { label: 'Órdenes', value: number(sum(rows, 'total_ordenes')), note: 'Compras confirmadas consultadas' },
        { label: 'Mayor recurrencia', value: top?.nombre || top?.email || '—', note: top ? `${number(top.total_ordenes)} órdenes` : 'Sin datos' },
      ];
    default:
      return [];
  }
}

function buildInsights(report, rows) {
  const top = leader(rows, report.chart);
  const total = sum(rows, report.chart);
  const sorted = [...rows].sort((a, b) => safeNumber(b[report.chart]) - safeNumber(a[report.chart]));
  const topThreeShare = total > 0 ? sum(sorted.slice(0, 3), report.chart) / total * 100 : 0;
  switch (report.id) {
    case 'ticket-promedio': {
      const orders = sum(rows, 'total_ordenes');
      const weighted = orders > 0 ? rows.reduce((acc, row) => acc + safeNumber(row.ticket_promedio) * safeNumber(row.total_ordenes), 0) / orders : 0;
      const above = rows.filter(row => safeNumber(row.ticket_promedio) > weighted).length;
      return [
        `${top?.ciudad || 'La ciudad líder'} registra el ticket más alto: ${top ? money(top.ticket_promedio) : 'sin dato'}.`,
        `${number(above)} de ${number(rows.length)} ciudades están sobre el promedio ponderado.`,
        `La lectura considera ${number(orders)} órdenes confirmadas.`,
      ];
    }
    case 'productos-mas-vendidos':
      return [
        `${top?.nombre || 'El producto líder'} encabeza el ranking con ${number(top?.unidades_vendidas)} unidades.`,
        `Los tres primeros concentran ${percent(topThreeShare)} de las unidades del ranking.`,
        `El conjunto consultado representa ${money(sum(rows, 'ingresos'))} en ingresos.`,
      ];
    case 'ventas-por-categoria': {
      const categories = [...new Set(rows.map(row => row.categoria))].map(categoria => ({ categoria, ingresos: sum(rows.filter(row => row.categoria === categoria), 'ingresos') }));
      const months = [...new Set(rows.map(row => row.mes))].map(mes => ({ mes, ingresos: sum(rows.filter(row => row.mes === mes), 'ingresos') }));
      const categoryTop = leader(categories, 'ingresos');
      const monthTop = leader(months, 'ingresos');
      return [
        `${categoryTop?.categoria || 'La categoría líder'} aporta el mayor ingreso acumulado: ${money(categoryTop?.ingresos || 0)}.`,
        `${monthTop?.mes || 'El periodo líder'} es el periodo de mayor ingreso: ${money(monthTop?.ingresos || 0)}.`,
        `La serie cubre ${number(categories.length)} categorías y ${number(months.length)} periodos.`,
      ];
    }
    case 'ventas-por-ciudad':
      return [
        `${top?.ciudad || 'La ciudad líder'} concentra ${total > 0 ? percent(safeNumber(top?.ingresos) / total * 100) : '0%'} de los ingresos consultados.`,
        `Las tres primeras ciudades reúnen ${percent(topThreeShare)} del ingreso.`,
        `La consulta contiene ${number(sum(rows, 'total_ordenes'))} órdenes confirmadas.`,
      ];
    case 'calificacion-vs-ventas': {
      const bands = getRatingBands(rows);
      const best = leader(bands, 'value');
      const unrated = rows.filter(row => safeNumber(row.calificacion_promedio) <= 0).length;
      return [
        `El rango ${best?.label || 'sin datos'} tiene el mayor promedio: ${number(best?.value)} unidades por producto.`,
        unrated === 1
          ? '1 producto no tiene calificación y se muestra por separado.'
          : `${number(unrated)} productos no tienen calificación y se muestran por separado.`,
        `La agrupación resume ${number(rows.length)} productos sin superponer puntos.`,
      ];
    }
    case 'clientes-frecuentes': {
      const topOrders = safeNumber(top?.total_ordenes);
      const tied = rows.filter(row => safeNumber(row.total_ordenes) === topOrders).length;
      return [
        `${top?.nombre || top?.email || 'El cliente líder'} registra ${number(topOrders)} órdenes.`,
        `${number(tied)} cliente${tied === 1 ? '' : 's'} comparten el nivel máximo de recurrencia.`,
        `Los tres primeros concentran ${percent(topThreeShare)} de las órdenes del ranking.`,
      ];
    }
    default:
      return [];
  }
}

function ChartHeader({ title, detail }) {
  return <div className="analytics-chart-header">
    <div><span>VISTA PRINCIPAL</span><h4>{title}</h4></div>
    <p>{detail}</p>
  </div>;
}

function SingleResultVisual({ report, row }) {
  const facts = report.columns.slice(1).map(column => ({
    label: column.label,
    value: column.format ? column.format(row[column.key]) : (row[column.key] || '—'),
  }));
  return <div className="analytics-chart-panel analytics-single">
    <ChartHeader title="Único resultado disponible" detail="No existe una segunda ubicación para comparar"/>
    <div className="analytics-single-content">
      <div><span>{report.columns[0].label}</span><strong>{report.chartLabel(row)}</strong></div>
      <dl>{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
    </div>
  </div>;
}

function RankingChart({ report, rows }) {
  if (rows.length === 1) return <SingleResultVisual report={report} row={rows[0]}/>;
  const values = [...rows].sort((a, b) => safeNumber(b[report.chart]) - safeNumber(a[report.chart])).slice(0, 6);
  const max = Math.max(1, ...values.map(row => safeNumber(row[report.chart])));
  return <div className="analytics-chart-panel">
    <ChartHeader title={report.chartTitle} detail={`Primeros ${number(values.length)} de ${number(rows.length)}`}/>
    <div className="analytics-ranking" role="img" aria-label={report.chartTitle}>
      {values.map((row, index) => {
        const label = report.chartLabel(row);
        const value = safeNumber(row[report.chart]);
        return <div className="analytics-rank-row" key={`${label}-${index}`}>
          <span className="analytics-rank-number">{String(index + 1).padStart(2, '0')}</span>
          <div className="analytics-rank-copy"><strong title={label}>{label}</strong><small>{report.secondary?.(row)}</small></div>
          <div className="analytics-rank-value"><strong>{report.chartFormat(value)}</strong><span>{percent(value / max * 100)} del líder</span></div>
          <div className="analytics-rank-track" aria-hidden="true"><span style={{ width: `${value / max * 100}%` }}/></div>
        </div>;
      })}
    </div>
  </div>;
}

function RatingBandsChart({ report, rows }) {
  const bands = getRatingBands(rows);
  const max = Math.max(1, ...bands.map(band => band.value));
  return <div className="analytics-chart-panel">
    <ChartHeader title={report.chartTitle} detail={`${number(rows.length)} productos agrupados`}/>
    <div className="analytics-rating-bands" role="img" aria-label={report.chartTitle}>
      {bands.map(band => <div className="analytics-rating-row" key={band.label}>
        <div><strong>{band.label}</strong><small>{number(band.count)} producto{band.count === 1 ? '' : 's'}</small></div>
        <div className="analytics-rating-track"><span style={{ width: `${band.value / max * 100}%` }}/></div>
        <strong>{number(band.value)} <small>unid. prom.</small></strong>
      </div>)}
    </div>
  </div>;
}

function TrendChart({ report, rows }) {
  const width = 760;
  const height = 270;
  const padding = { left: 62, right: 22, top: 18, bottom: 42 };
  const months = [...new Set(rows.map(row => String(row.mes || 'Sin mes')))].sort((a, b) => a.localeCompare(b, 'es'));
  const categories = [...new Set(rows.map(row => String(row.categoria || 'Sin categoría')))]
    .map(category => ({ category, total: sum(rows.filter(row => String(row.categoria || 'Sin categoría') === category), 'ingresos') }))
    .sort((a, b) => b.total - a.total).slice(0, 4).map(item => item.category);
  const palette = ['#245b46', '#a56c35', '#65788a', '#8a725e'];
  const series = categories.map(category => ({
    category,
    values: months.map(month => rows.filter(row => String(row.categoria || 'Sin categoría') === category && String(row.mes || 'Sin mes') === month).reduce((total, row) => total + safeNumber(row.ingresos), 0)),
  }));
  const max = Math.max(1, ...series.flatMap(item => item.values));
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = index => padding.left + (months.length > 1 ? index / (months.length - 1) * plotWidth : plotWidth / 2);
  const y = value => padding.top + plotHeight - value / max * plotHeight;
  if (months.length < 2) return <RankingChart report={report} rows={rows}/>;
  return <div className="analytics-chart-panel">
    <ChartHeader title={report.chartTitle} detail={`${number(categories.length)} categorías principales · ${number(months.length)} periodos`}/>
    <div className="analytics-svg-wrap">
      <svg className="analytics-svg" style={{ minWidth: `${Math.max(620, months.length * 90)}px` }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={report.chartTitle}>
        {[0, .25, .5, .75, 1].map(tick => <g key={tick}>
          <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight * tick} y2={padding.top + plotHeight * tick} className="analytics-grid-line"/>
          <text x={padding.left - 9} y={padding.top + plotHeight * tick + 4} textAnchor="end" className="analytics-axis-text">{number(max * (1 - tick))}</text>
        </g>)}
        {months.map((month, index) => <text key={month} x={x(index)} y={height - 14} textAnchor="middle" className="analytics-axis-text">{month.slice(5)}</text>)}
        {series.map((item, seriesIndex) => <g key={item.category}>
          <polyline points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={palette[seriesIndex]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
          {item.values.map((value, index) => <circle key={`${item.category}-${months[index]}`} cx={x(index)} cy={y(value)} r="4" fill={palette[seriesIndex]}><title>{`${item.category} · ${months[index]}: ${money(value)}`}</title></circle>)}
        </g>)}
      </svg>
      <div className="analytics-legend">{categories.map((category, index) => <span key={category}><i style={{ backgroundColor: palette[index] }}/>{category}</span>)}</div>
    </div>
  </div>;
}

function AnalyticsChart({ report, rows }) {
  if (report.chartType === 'rating-bands') return <RatingBandsChart report={report} rows={rows}/>;
  if (report.chartType === 'trend') return <TrendChart report={report} rows={rows}/>;
  return <RankingChart report={report} rows={rows}/>;
}

function InsightPanel({ report, rows }) {
  const insights = buildInsights(report, rows);
  return <aside className="analytics-insights">
    <div className="analytics-insight-title"><Lightbulb size={17}/><div><span>LECTURA RÁPIDA</span><h4>Qué conviene mirar</h4></div></div>
    <ol>{insights.map((insight, index) => <li key={insight}><span>{index + 1}</span><p>{insight}</p></li>)}</ol>
    <p className="analytics-insight-note">Conclusiones calculadas solo con los registros de esta consulta.</p>
  </aside>;
}

function ReportResults({ report, preview = false }) {
  const loader = useCallback(
    () => preview ? Promise.resolve(PREVIEW_DATA[report.id] || []) : analiticaService.consultar(report.id),
    [preview, report.id],
  );
  const request = useFetch(loader);
  const rows = request.data || [];
  const metrics = buildMetrics(report, rows);
  return <div className="analytics-results">
    <div className="analytics-toolbar">
      <div><p>{report.description}</p><span>{preview ? 'Vista previa local · datos ilustrativos' : 'AWS Athena · caché de 5 minutos'}</span></div>
      <button className="analytics-refresh" onClick={request.retry} disabled={request.loading}><RefreshCw size={14}/> {preview ? 'Recargar vista' : 'Actualizar datos'}</button>
    </div>
    <RequestState {...request}/>
    {!request.loading && !request.error && (rows.length
      ? <>
        <div className="analytics-kpis">{metrics.map(metric => <article key={metric.label}><span>{metric.label}</span><strong title={metric.value}>{metric.value}</strong><small>{metric.note}</small></article>)}</div>
        <div className="analytics-main-grid"><AnalyticsChart report={report} rows={rows}/><InsightPanel report={report} rows={rows}/></div>
        <details className="analytics-details">
          <summary><span><Table2 size={16}/><strong>Ver registros de la consulta</strong><small>{number(rows.length)} filas · {preview ? 'datos ilustrativos' : 'AWS Athena'}</small></span><ChevronDown size={17}/></summary>
          <div className="analytics-table-wrap"><table className="admin-table analytics-table">
            <thead><tr>{report.columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${report.id}-${index}`}>{report.columns.map(column => <td key={column.key}>{column.format ? column.format(row[column.key]) : (row[column.key] || '—')}</td>)}</tr>)}</tbody>
          </table></div>
        </details>
      </>
      : <p className="empty-address">La consulta no devolvió registros. Comprueba que la ingesta haya cargado datos en S3.</p>)}
  </div>;
}

export default function AdminAnalitica() {
  const [selected, setSelected] = useState(reports[0].id);
  const report = reports.find(item => item.id === selected);
  const isLocalPreview = import.meta.env.DEV && isDemo;
  return <section className="admin-section analytics-section">
    <div className="section-heading"><div><p className="analytics-overline"><BarChart3 size={15}/> CENTRO DE ANÁLISIS</p><h2>Analítica de CloudShop</h2><p className="analytics-intro">Seis lecturas operativas para entender ventas, productos, ubicaciones y recurrencia sin modificar los datos de origen.</p></div></div>
    <div className="analytics-selector" role="group" aria-label="Consultas de analítica">
      {reports.map((item, index) => <button key={item.id} type="button" className={selected === item.id ? 'selected' : ''} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><span>{String(index + 1).padStart(2, '0')}</span>{item.label}</button>)}
    </div>
    <div className="analytics-report-heading"><div><span>REPORTE ACTIVO</span><h3>{report.label}</h3></div><p>{isLocalPreview ? 'Propuesta visual local' : 'Consulta analítica bajo demanda'}</p></div>
    {isDemo && !isLocalPreview
      ? <div className="analytics-live-state"><Database size={22}/><div><strong>Datos analíticos disponibles en el entorno conectado a AWS</strong><p>Esta vista se alimenta de los endpoints reales de analítica cuando <code>VITE_USE_MOCKS=false</code>.</p></div></div>
      : <ReportResults key={report.id} report={report} preview={isLocalPreview}/>}
  </section>;
}
