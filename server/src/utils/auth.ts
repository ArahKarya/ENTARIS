import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}

if (process.env.JWT_SECRET!.startsWith('ganti-dengan')) {
  console.error('FATAL: JWT_SECRET is still set to the placeholder value. Please change it.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

export interface TokenPayload {
  userId: string;
  role: string;
  /**
   * Penanda panggilan internal (hanya ada di JWT berumur pendek buatan server):
   * 'mcp' = layer MCP, 'demo' = generator data uji coba.
   */
  via?: 'mcp' | 'demo';
  mcpToken?: string;
  mcpChannel?: string;
  mcpTool?: string;
  mcpApprovalId?: string;
  /** Referensi opak chat/sesi dari actor assertion (`ref`), diteruskan ke handler. */
  mcpRef?: string;
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
};

/** JWT berumur pendek (detik) untuk satu panggilan handler internal (MCP) atas nama user. */
export const generateShortLivedToken = (payload: TokenPayload, ttlSeconds: number): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
};
