"use client";

import React from 'react';

interface RadarData {
    label: string;
    value: number; // 0-100
}

interface RadarChartProps {
    data: {
        label: string;
        scores: RadarData[];
        color: string;
    }[];
    metrics: string[];
}

export function RadarChart({ data, metrics }: RadarChartProps) {
    const size = 300;
    const center = size / 2;
    const radius = size * 0.4;
    const angleStep = (Math.PI * 2) / metrics.length;

    const getPoint = (score: number, index: number) => {
        const r = (score / 100) * radius;
        const angle = index * angleStep - Math.PI / 2;
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle),
        };
    };

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
                {/* Background Polygons (Grid) */}
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((level) => (
                    <polygon
                        key={level}
                        points={metrics.map((_, i) => {
                            const p = getPoint(level * 100, i);
                            return `${p.x},${p.y}`;
                        }).join(' ')}
                        className="fill-none stroke-white/5 stroke-1"
                    />
                ))}

                {/* Axis Lines */}
                {metrics.map((m, i) => {
                    const p = getPoint(100, i);
                    return (
                        <line
                            key={m}
                            x1={center}
                            y1={center}
                            x2={p.x}
                            y2={p.y}
                            className="stroke-white/10 stroke-1"
                        />
                    );
                })}

                {/* Metric Labels */}
                {metrics.map((m, i) => {
                    const p = getPoint(115, i);
                    return (
                        <text
                            key={m}
                            x={p.x}
                            y={p.y}
                            textAnchor="middle"
                            alignmentBaseline="middle"
                            className="fill-white/40 text-[10px] uppercase font-bold tracking-widest"
                        >
                            {m}
                        </text>
                    );
                })}

                {/* Data Polygons */}
                {data.map((d, setIdx) => (
                    <g key={d.label}>
                        <polygon
                            points={d.scores.map((s, i) => {
                                const p = getPoint(s.value, i);
                                return `${p.x},${p.y}`;
                            }).join(' ')}
                            style={{ fill: d.color, opacity: 0.3, stroke: d.color, strokeWidth: 2 }}
                            className="transition-all duration-500"
                        />
                        {d.scores.map((s, i) => {
                            const p = getPoint(s.value, i);
                            return (
                                <circle
                                    key={i}
                                    cx={p.x}
                                    cy={p.y}
                                    r={3}
                                    style={{ fill: d.color }}
                                />
                            );
                        })}
                    </g>
                ))}
            </svg>
            <div className="mt-6 flex gap-6">
                {data.map(d => (
                    <div key={d.label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-xs font-medium text-white/70">{d.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
