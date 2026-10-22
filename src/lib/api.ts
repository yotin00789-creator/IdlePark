/* eslint-disable @typescript-eslint/no-explicit-any -- response shapes are typed at each call site */
export class ApiError extends Error {
  status: number;
  data: Record<string, any>;
  constructor(status: number, message: string, data: Record<string, any> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const isBytes = body instanceof Blob || body instanceof ArrayBuffer;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        "x-csrf": "1",
        ...(body !== undefined && !isBytes ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isBytes ? (body as BodyInit) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) unauthorizedListeners.forEach((l) => l());
    throw new ApiError(res.status, data?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่", data ?? {});
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b: unknown = {}) => request<T>("POST", p, b),
  put: <T = any>(p: string, b: unknown = {}) => request<T>("PUT", p, b),
  patch: <T = any>(p: string, b: unknown = {}) => request<T>("PATCH", p, b),
  del: <T = any>(p: string) => request<T>("DELETE", p),
  putImage: <T = any>(p: string, blob: Blob) => request<T>("PUT", p, blob, { "content-type": blob.type }),
};

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
