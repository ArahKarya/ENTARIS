import React from 'react';

interface Props {
  rows?: number;
  columns?: number;
}

const ReportTableSkeleton: React.FC<Props> = ({ rows = 8, columns = 4 }) => (
  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
    {/* Header */}
    <div className="flex gap-4 px-4 py-3 border-b border-gray-100">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className={`h-3 bg-gray-200 rounded ${i === 0 ? 'w-20' : 'flex-1'}`} />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-gray-50">
        {Array.from({ length: columns }).map((_, j) => (
          <div
            key={j}
            className={`h-3 bg-gray-100 rounded ${j === 0 ? 'w-16' : 'flex-1'}`}
            style={{ opacity: 1 - i * 0.08 }}
          />
        ))}
      </div>
    ))}
  </div>
);

export default ReportTableSkeleton;
