// ------------------- 工具函数 -------------------

/**
 * 将字符串转换为适合文件名的格式
 * @param input 输入字符串
 * @param maxLen 最大长度
 * @returns 处理后的字符串
 */
export function slugify(input: string, maxLen = 40): string {
  if (!input) return '';
  return input
    .toString()
    .normalize('NFKD')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '') // strip non-ascii to avoid weird filenames
    .replace(/[^\w\s-]/g, '') // remove non-word chars
    .trim()
    .replace(/\s+/g, '-') // spaces to dashes
    .substring(0, maxLen)
    .replace(/-+$/g, '');
}

/**
 * 生成当前时间戳字符串
 * @returns 格式为 YYYYMMDD_HHMMSS 的时间戳
 */
export function nowTimestamp(): string {
  const d = new Date();
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}
