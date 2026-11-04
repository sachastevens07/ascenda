import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { fonts } from '@/constants/fonts';
import { colours } from '@/constants/theme';

export type ChartPoint = { x: number; y: number };

type LineChartProps = {
  /** Oldest first. */
  points: ChartPoint[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  height?: number;
};

const PADDING = { top: 14, right: 14, bottom: 28, left: 52 };

/** A simple line chart; x positions are proportional (e.g. to time). */
export function LineChart({ points, formatX, formatY, height = 200 }: LineChartProps) {
  const [width, setWidth] = useState(0);

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const [dataMin, dataMax] = [Math.min(...ys), Math.max(...ys)];
  const spread = dataMax - dataMin || Math.max(dataMax * 0.1, 1);
  const yMin = Math.max(0, dataMin - spread * 0.15);
  const yMax = dataMax + spread * 0.15;

  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const toX = (x: number) =>
    PADDING.left + (xMax === xMin ? plotWidth / 2 : ((x - xMin) / (xMax - xMin)) * plotWidth);
  const toY = (y: number) => PADDING.top + (1 - (y - yMin) / (yMax - yMin)) * plotHeight;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.x)},${toY(point.y)}`)
    .join(' ');
  const bottom = PADDING.top + plotHeight;
  const area =
    points.length > 1
      ? `${line} L${toX(xMax)},${bottom} L${toX(xMin)},${bottom} Z`
      : null;
  const gridValues = [yMax, (yMax + yMin) / 2, yMin];
  const last = points[points.length - 1];

  return (
    <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && points.length > 0 && (
        <Svg width={width} height={height}>
          {gridValues.map((value) => (
            <Line
              key={value}
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={toY(value)}
              y2={toY(value)}
              stroke={colours.border}
              strokeWidth={1}
            />
          ))}
          {gridValues.map((value) => (
            <SvgText
              key={`label-${value}`}
              x={PADDING.left - 8}
              y={toY(value) + 4}
              fontFamily={fonts.medium}
              fontSize={12}
              fill={colours.textMuted}
              textAnchor="end">
              {formatY(value)}
            </SvgText>
          ))}
          {area && <Path d={area} fill={colours.accentSoft} />}
          <Path d={line} stroke={colours.accent} strokeWidth={3} fill="none" strokeLinejoin="round" />
          {points.map((point, index) => (
            <Circle
              key={index}
              cx={toX(point.x)}
              cy={toY(point.y)}
              r={point === last ? 6 : 4}
              fill={point === last ? colours.accent : colours.surface}
              stroke={colours.accent}
              strokeWidth={2}
            />
          ))}
          <SvgText
            x={PADDING.left}
            y={height - 6}
            fontFamily={fonts.medium}
            fontSize={12}
            fill={colours.textMuted}
            textAnchor="start">
            {formatX(xMin)}
          </SvgText>
          {xMax !== xMin && (
            <SvgText
              x={width - PADDING.right}
              y={height - 6}
              fontFamily={fonts.medium}
              fontSize={12}
              fill={colours.textMuted}
              textAnchor="end">
              {formatX(xMax)}
            </SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}
