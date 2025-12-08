# Vercel Deployment Guide

This project is ready for deployment to Vercel. Follow these steps:

## Quick Deploy

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push to Git Repository**
   - Push your code to GitHub, GitLab, or Bitbucket
   - Make sure all files are committed

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with your Git provider
   - Click "Add New Project"
   - Import your repository

3. **Configure Project**
   - Vercel will auto-detect Vite
   - Verify these settings:
     - **Framework Preset:** Vite
     - **Build Command:** `npm run build`
     - **Output Directory:** `dist`
     - **Install Command:** `npm install`
   - Click "Deploy"

4. **Wait for Deployment**
   - Vercel will build and deploy your project
   - You'll get a live URL (e.g., `your-project.vercel.app`)

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **For Production Deployment**
   ```bash
   vercel --prod
   ```

## Configuration Files

The project includes:

- **`vercel.json`** - Vercel configuration with SPA routing
- **`.vercelignore`** - Files to exclude from deployment
- **`.gitignore`** - Git ignore patterns

## Important Notes

1. **SPA Routing**: The `vercel.json` includes rewrites to handle React Router client-side routing
2. **Build Output**: Files are built to the `dist` directory
3. **Environment Variables**: If needed, add them in Vercel Dashboard → Project Settings → Environment Variables
4. **Custom Domain**: You can add a custom domain in Vercel Dashboard → Project Settings → Domains

## Post-Deployment

After deployment:

1. Your app will be live at `your-project.vercel.app`
2. Every push to your main branch will trigger automatic deployments
3. Preview deployments are created for pull requests

## Troubleshooting

- **Build Fails**: Check the build logs in Vercel Dashboard
- **404 on Routes**: Ensure `vercel.json` rewrites are configured correctly
- **Assets Not Loading**: Verify the output directory is set to `dist`

## Support

For Vercel-specific issues, check:
- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html#vercel)

