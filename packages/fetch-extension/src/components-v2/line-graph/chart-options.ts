import { ChartOptions } from "chart.js";

export const chartOptions: ChartOptions = {
  legend: { display: false },
  maintainAspectRatio: false,
  scales: {
    xAxes: [
      {
        display: false,
        gridLines: { display: false },
        ticks: { display: false },
      },
    ],
    yAxes: [{ ticks: { display: false }, gridLines: { display: false } }],
  },
  tooltips: {
    mode: "index",
    intersect: false,
    titleFontColor: "#A1A3A3",
    backgroundColor: "transparent",
    bodyFontColor: "#151A1A",
    displayColors: false,
    caretSize: 3,
    callbacks: {
      label: (tooltipItem: any, data: any) => {
        const label = data.datasets[tooltipItem.datasetIndex].label || "";
        const value = tooltipItem.yLabel || "";
        return ` ${label} ${value} ${data.datasets[
          tooltipItem.datasetIndex
        ].vsCurrency.toUpperCase()}`;
      },
    },
  },
  elements: {
    line: {
      borderWidth: 2,
    },
  },
};
