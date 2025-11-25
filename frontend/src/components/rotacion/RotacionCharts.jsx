import { Doughnut, Line } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
)

const baseCurrencyFormatter = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 0
})

export function WeeklyTrendChart({ data }) {
  if (!data || data.labels.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay historial suficiente para graficar.</p>
  }

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Unidades faltantes',
        data: data.cantidad,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(99,102,241,0.15)',
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        yAxisID: 'y'
      },
      {
        label: 'Margen perdido (₡)',
        data: data.margen,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.15)',
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        yAxisID: 'y1'
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        position: 'bottom'
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            if (context.dataset.yAxisID === 'y1') {
              return `${context.dataset.label}: ${baseCurrencyFormatter.format(context.parsed.y)}`
            }
            return `${context.dataset.label}: ${context.parsed.y.toLocaleString('es-CR')} und`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Unidades'
        }
      },
      y1: {
        beginAtZero: true,
        position: 'right',
        grid: {
          drawOnChartArea: false
        },
        title: {
          display: true,
          text: 'Margen perdido'
        },
        ticks: {
          callback: (value) => baseCurrencyFormatter.format(value)
        }
      }
    }
  }

  return (
    <div className="h-64">
      <Line data={chartData} options={chartOptions} />
    </div>
  )
}

export function TopMargenChart({ data }) {
  if (!data || data.labels.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay productos suficientes para graficar.</p>
  }

  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Margen perdido',
        data: data.values,
        backgroundColor: ['#fca5a5', '#fdba74', '#fcd34d', '#bfdbfe', '#c4b5fd'],
        borderWidth: 1
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom'
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${baseCurrencyFormatter.format(context.parsed)}`
        }
      }
    },
    cutout: '65%'
  }

  return (
    <div className="h-64">
      <Doughnut data={chartData} options={chartOptions} />
    </div>
  )
}


