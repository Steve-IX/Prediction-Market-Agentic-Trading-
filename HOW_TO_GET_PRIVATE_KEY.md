# How to Get Your Ethereum Private Key

## ⚠️ Security Warning

**NEVER share your private key with anyone!**
- Keep it secret and secure
- Only use it in environment variables (never commit to Git)
- Consider using a dedicated wallet for trading bots

## Your Wallet Address

Based on your information:
- **Address**: `0x8569d26c60f6ed0454683ba405730aab18ff540e`

You need the **private key** for this address.

## Methods to Get Your Private Key

### Method 1: MetaMask (Most Common)

1. **Open MetaMask** browser extension
2. **Click the account icon** (top right)
3. **Select "Account Details"**
4. **Click "Export Private Key"**
5. **Enter your MetaMask password**
6. **Copy the private key** (starts with `0x`)
7. **Verify the address matches**: `0x8569d26c60f6ed0454683ba405730aab18ff540e`

⚠️ **Important**: Make sure you're exporting from the correct account!

### Method 2: Hardware Wallet (Ledger/Trezor)

If your wallet is on a hardware wallet:

1. **You cannot directly export the private key** (this is a security feature)
2. **Options**:
   - Use a software wallet (MetaMask) and import your hardware wallet
   - Create a new wallet specifically for the trading bot
   - Use the hardware wallet's software interface (if available)

### Method 3: Other Software Wallets

#### Trust Wallet
1. Open Trust Wallet app
2. Go to **Settings** → **Wallets**
3. Select your wallet
4. Tap **Show Private Key**
5. Enter your password/biometric
6. Copy the private key

#### Coinbase Wallet
1. Open Coinbase Wallet app
2. Go to **Settings** → **Security**
3. Tap **Recovery Phrase** or **Private Key**
4. Enter your password
5. Copy the private key

#### MyEtherWallet (MEW)
1. Go to [MyEtherWallet.com](https://www.myetherwallet.com)
2. Access your wallet using your method
3. Go to **View & Send**
4. Click **Private Key** (if available)
5. Enter your password
6. Copy the private key

### Method 4: From Recovery Phrase (Mnemonic)

If you have your 12/24-word recovery phrase:

1. Use a tool like [Ian Coleman's BIP39 Tool](https://iancoleman.io/bip39/) (use offline!)
2. Enter your mnemonic phrase
3. Select the derivation path (usually `m/44'/60'/0'/0/0`)
4. Find the address matching `0x8569d26c60f6ed0454683ba405730aab18ff540e`
5. Copy the private key for that address

⚠️ **Security**: Only use this tool offline! Download it and run locally.

### Method 5: Create a New Wallet (Recommended for Bots)

**Best Practice**: Create a dedicated wallet for your trading bot:

1. **Create new wallet** in MetaMask
2. **Save the private key securely**
3. **Transfer funds** from your main wallet to the bot wallet
4. **Use the bot wallet's private key** in your application

This way:
- Your main wallet stays secure
- You can limit funds in the bot wallet
- Easier to track bot transactions

## Verifying Your Private Key

After getting your private key, verify it matches your address:

### Using Node.js (Quick Test)

```bash
node -e "const { Wallet } = require('ethers'); const w = new Wallet('YOUR_PRIVATE_KEY'); console.log('Address:', w.address);"
```

The address should match: `0x8569d26c60f6ed0454683ba405730aab18ff540e`

### Using Online Tools (Less Secure)

⚠️ **Warning**: Only use trusted tools, and be cautious!

- [MyEtherWallet](https://www.myetherwallet.com) - Can verify addresses
- [Etherscan](https://etherscan.io) - Check your address

## Format

Your private key should:
- Start with `0x`
- Be 66 characters long (including `0x`)
- Example: `0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`

## Using in Railway

Once you have your private key:

1. Go to Railway → Your Project → Variables
2. Add:
   ```
   POLYMARKET_PRIVATE_KEY=0x[YOUR-PRIVATE-KEY-HERE]
   ```
3. **Never commit this to Git!**

## Troubleshooting

### "Invalid private key"
- Make sure it starts with `0x`
- Check for extra spaces or newlines
- Verify it's 66 characters total

### "Address doesn't match"
- Double-check you're exporting from the correct wallet
- Verify the address in your wallet matches: `0x8569d26c60f6ed0454683ba405730aab18ff540e`

### "Can't find private key option"
- Some wallets don't allow direct export (hardware wallets)
- Consider creating a new wallet for the bot
- Or use a wallet that supports private key export

## Security Best Practices

1. ✅ **Use a dedicated wallet** for trading bots
2. ✅ **Store private keys securely** (password manager, encrypted)
3. ✅ **Never commit private keys** to Git
4. ✅ **Use environment variables** only
5. ✅ **Limit funds** in bot wallet
6. ✅ **Monitor transactions** regularly
7. ✅ **Use hardware wallet** for main funds

## Need Help?

If you're having trouble:
1. Check your wallet's documentation
2. Verify you're using the correct account
3. Consider creating a new wallet for the bot (safest option)

---

**Remember**: Your private key gives full control over your wallet. Keep it secret! 🔐
