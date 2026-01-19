import * as crypto from 'crypto';
import { ethers } from 'ethers';

/**
 * EIP-712 domain for Polymarket
 */
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/**
 * EIP-712 typed data structure
 */
export interface TypedData {
  domain: EIP712Domain;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}

/**
 * Sign EIP-712 typed data
 * @param wallet Ethereum wallet instance
 * @param domain EIP-712 domain
 * @param types Type definitions
 * @param message Message to sign
 * @returns Signature string (0x-prefixed hex)
 */
export async function signEIP712(
  wallet: ethers.Wallet,
  domain: EIP712Domain,
  types: Record<string, Array<{ name: string; type: string }>>,
  message: Record<string, unknown>
): Promise<string> {
  return wallet._signTypedData(domain, types, message);
}

/**
 * Create EIP-712 domain for Polymarket
 */
export function createPolymarketDomain(chainId: number): EIP712Domain {
  return {
    name: 'Polymarket',
    version: '1',
    chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000', // Placeholder
  };
}

/**
 * Sign data with RSA-PSS (for Kalshi)
 * @param privateKey RSA private key (KeyObject or PEM string)
 * @param data Data to sign (string or Buffer)
 * @returns Base64-encoded signature
 */
export function signRSAPSS(
  privateKey: crypto.KeyObject | string,
  data: string | Buffer
): string {
  const keyObject = typeof privateKey === 'string' ? crypto.createPrivateKey(privateKey) : privateKey;
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  // Use RSA-PSS padding - Node.js uses RSA_PKCS1_PSS_PADDING constant
  // For RSA-PSS, we need to use the createSign API with proper options
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(dataBuffer);
  
  // Use RSA-PSS padding (constant value is 6 for RSA_PKCS1_PSS_PADDING)
  const padding = crypto.constants.RSA_PKCS1_PSS_PADDING ?? 6;
  const saltLength = crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN ?? -1;
  
  const signature = signer.sign({
    key: keyObject,
    padding,
    saltLength,
  });
  
  return signature.toString('base64');

  return signature.toString('base64');
}

/**
 * Verify RSA-PSS signature
 * @param publicKey RSA public key (KeyObject or PEM string)
 * @param data Original data
 * @param signature Base64-encoded signature
 * @returns true if signature is valid
 */
export function verifyRSAPSS(
  publicKey: crypto.KeyObject | string,
  data: string | Buffer,
  signature: string
): boolean {
  try {
    const keyObject = typeof publicKey === 'string' ? crypto.createPublicKey(publicKey) : publicKey;
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const signatureBuffer = Buffer.from(signature, 'base64');

    // Use RSA-PSS padding
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(dataBuffer);
    
    const padding = crypto.constants.RSA_PKCS1_PSS_PADDING ?? 6;
    const saltLength = crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN ?? -1;
    
    return verifier.verify(
      {
        key: keyObject,
        padding,
        saltLength,
      },
      signatureBuffer
    );
  } catch {
    return false;
  }
}

/**
 * Generate message for Kalshi API signing
 * @param method HTTP method
 * @param timestamp Timestamp in milliseconds
 * @param path API path (without query parameters)
 * @returns Message string to sign
 */
export function createKalshiSigningMessage(method: string, timestamp: number, path: string): string {
  // Remove query parameters from path
  const cleanPath = path.split('?')[0];
  return `${method}${timestamp}${cleanPath}`;
}

/**
 * Hash data with SHA-256
 * @param data Data to hash
 * @returns Hex-encoded hash
 */
export function sha256(data: string | Buffer): string {
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return crypto.createHash('sha256').update(dataBuffer).digest('hex');
}

/**
 * Generate random nonce
 * @param length Nonce length in bytes (default: 16)
 * @returns Hex-encoded nonce
 */
export function generateNonce(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Derive API key from wallet (for Polymarket L2)
 * This is a placeholder - actual implementation depends on Polymarket's API key generation
 */
export function deriveApiKey(_wallet: ethers.Wallet): {
  apiKey: string;
  secret: string;
  passphrase: string;
} {
  // This is a placeholder - actual implementation would call Polymarket's API
  // to generate API credentials using L1 wallet signature
  throw new Error('API key derivation must be done through Polymarket API');
}
