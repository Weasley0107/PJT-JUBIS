'use client';

interface Props {
  resetTime: Date;
  onLater: () => void;
  onChangeAccount: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function TokenExhaustedModal({ resetTime, onLater, onChangeAccount }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-6">
        {/* 아이콘 */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 mx-auto mb-4">
          <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        {/* 제목 */}
        <h2 className="text-base font-bold text-gray-900 dark:text-white text-center mb-1">
          토큰을 모두 사용했습니다
        </h2>

        {/* 초기화 시간 */}
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{formatTime(resetTime)}</span>에 초기화됩니다.
        </p>

        {/* 버튼 */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onLater}
            className="w-full py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-xl transition-colors"
          >
            나중에 이어하기
          </button>
          <button
            onClick={onChangeAccount}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            계정 변경 후 진행
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-3">
          지금까지 분석된 내용은 히스토리에 저장됩니다.
        </p>
      </div>
    </div>
  );
}
