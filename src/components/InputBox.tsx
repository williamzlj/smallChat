import { useState, KeyboardEvent, useRef } from 'react';
import { Send, Paperclip, Smile, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import {
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
  IMAGE_COMPRESS_THRESHOLD_KB,
} from '../config';

interface Props {
  onSendText: (content: string) => Promise<void>;
  onSendFile: (file: File | Blob, filename: string, kind: 'image' | 'file') => Promise<void>;
  sending: boolean;
  uploadProgress: number | null;
  isDarkMode: boolean;
  fontSize: number;
}

// 图片压缩：超宽缩小，大图转 JPEG
function compressImage(file: File): Promise<{ blob: Blob; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > IMAGE_MAX_WIDTH) {
          height = Math.round((IMAGE_MAX_WIDTH / width) * height);
          width = IMAGE_MAX_WIDTH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ blob: file, filename: file.name });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const base = file.name.replace(/\.[^.]+$/, '') || 'image';
              resolve({ blob, filename: `${base}.jpg` });
            } else {
              resolve({ blob: file, filename: file.name });
            }
          },
          'image/jpeg',
          IMAGE_QUALITY,
        );
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export const InputBox = ({
  onSendText,
  onSendFile,
  sending,
  uploadProgress,
  isDarkMode,
  fontSize,
}: Props) => {
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MAX_LINES = 12;
  const LINE_HEIGHT = Math.round(fontSize * 1.45);
  const MIN_HEIGHT = LINE_HEIGHT + 16;

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_LINES * LINE_HEIGHT)}px`;
  };

  const submitText = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setError('');
    try {
      await onSendText(content);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      submitText();
    }
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    try {
      let blob: File | Blob = file;
      let filename = file.name;
      const needCompress =
        file.size / 1024 > IMAGE_COMPRESS_THRESHOLD_KB ||
        (file.type === 'image/png' && file.size / 1024 > IMAGE_COMPRESS_THRESHOLD_KB);
      if (needCompress) {
        const r = await compressImage(file);
        blob = r.blob;
        filename = r.filename;
      }
      await onSendFile(blob, filename, 'image');
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片发送失败');
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > 50 * 1024 * 1024) {
      setError('文件不能超过 50MB');
      return;
    }
    try {
      await onSendFile(file, file.name, 'file');
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件发送失败');
    }
  };

  const insertEmoji = (em: string) => {
    setInput((prev) => prev + em);
    textareaRef.current?.focus();
  };

  const emojis = [
    '😀', '😄', '😆', '😅', '🤣', '🙂', '😊', '😴', '🤗', '🥰',
    '😍', '😘', '😛', '😎', '🤓', '😔', '😢', '😭', '😡', '👍',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕',
    '☀️', '🌤️', '☁️', '🌧️', '❄️', '🔥', '💧', '🌸', '🍀', '⭐',
  ];

  const btnCls = `p-2 rounded-full transition-colors flex-shrink-0 ${
    isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
  }`;

  return (
    <div className={`border-t px-2 py-2 sm:px-4 sm:py-3 pb-safe ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      {uploadProgress !== null && (
        <div className="mb-2 flex items-center space-x-2 px-1">
          <Loader2 className="w-4 h-4 animate-spin text-green-500 flex-shrink-0" />
          <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <div className="h-full bg-green-500 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="text-xs text-gray-400 w-10 text-right">{uploadProgress}%</span>
        </div>
      )}
      {error && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs text-red-500">{error}</span>
          <button onClick={() => setError('')} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1 w-full">
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
        <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" />

        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={sending}
          className={btnCls}
          title="发送图片"
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className={btnCls}
          title="发送文件"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className={btnCls}
            title="表情"
          >
            <Smile className="w-5 h-5" />
          </button>
          {showEmoji && (
            <div
              className={`absolute bottom-full left-0 mb-2 p-2 rounded-xl shadow-lg border grid grid-cols-10 gap-1 z-30 ${
                isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
              }`}
            >
              {emojis.map((em, i) => (
                <button
                  key={i}
                  onClick={() => insertEmoji(em)}
                  className={`text-xl p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowEmoji(false)}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={1}
          className={`flex-1 mx-1 px-3 py-2 rounded-2xl outline-none resize-none overflow-y-auto ${
            isDarkMode ? 'bg-gray-700 text-white placeholder-gray-400' : 'bg-gray-100 text-gray-800 placeholder-gray-400'
          }`}
          style={{
            minHeight: `${MIN_HEIGHT}px`,
            maxHeight: `${MAX_LINES * LINE_HEIGHT}px`,
            lineHeight: `${LINE_HEIGHT}px`,
            fontSize: `${fontSize}px`,
          }}
        />

        <button
          onClick={submitText}
          disabled={!input.trim() || sending}
          className={`p-2.5 rounded-full transition-all flex-shrink-0 ${
            input.trim() && !sending
              ? 'bg-green-500 text-white hover:bg-green-600 shadow-md'
              : isDarkMode
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          title="发送"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
