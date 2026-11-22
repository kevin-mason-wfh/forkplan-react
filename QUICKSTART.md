# Quick Start: Forkplan Configuration

## 🖼️ Fix Images Not Showing

**Problem**: Recipe images don't display even though S3 base is added.

**Solution**: Configure the S3 image base URL properly.

### Step 1: Create `.env` or `.env.local` file
```env
VITE_IMAGE_BASE=https://your-cloudfront-url.cloudfront.net
```

### Step 2: Verify S3 URL Format
- ✅ Correct: `https://d12345.cloudfront.net`
- ✅ Correct: `https://my-bucket.s3.eu-west-2.amazonaws.com`
- ❌ Wrong: `s3://bucket-name/` (this won't work in browser!)
- ❌ Wrong: `https://my-bucket.s3.eu-west-2.amazonaws.com/` (remove trailing slash)

### Step 3: Restart Dev Server
```bash
npm run dev
```

---

## 📱 Mobile Navigation Improvements

**Changes Made**:
- Navigation moved to **bottom of screen** on mobile (iOS style)
- Stays accessible while scrolling
- Content automatically padded to prevent overlap
- Horizontal scroll for many navigation items

**How it looks**:
- Desktop: Vertical sidebar on the left
- Mobile: Horizontal nav bar fixed at bottom

**No action needed** - already implemented in `src/styles.css`

---

## 🍽️ Recipe Detail Images

**How it works**:
1. Each recipe has an `image_key` (e.g., `recipes/abc123.jpg`)
2. Full URL = `{VITE_IMAGE_BASE}/{image_key}`
3. Images display in both:
   - Recipe cards (list view)
   - Recipe detail modal (when you click a recipe)

**Code location**: `src/views/Recipes.jsx` - Detail component

**Fallback**: If no image, shows 🍽 emoji

---

## 🔧 Backend API Configuration

**Location**: `vite.config.js` line 5

**Default**: `https://kt7490x9c3.execute-api.eu-west-2.amazonaws.com/dev`

**To change**:
```bash
export FORKPLAN_API=https://your-api.com
# OR set in .env / .env.local
FORKPLAN_API=https://your-api.com
```

**How it works**:
- Dev: `/api` requests proxied to `FORKPLAN_API` (avoids CORS)
- Production: Amplify rewrite rule handles `/api` redirects

---

## 📋 Deployment Checklist

### For AWS Amplify:

1. **Environment Variables** (Amplify Console > App Settings > Build settings)
   ```
   VITE_IMAGE_BASE=https://your-cloudfront-url.cloudfront.net
   FORKPLAN_API=https://your-api.com (optional, uses default if not set)
   ```

2. **Deploy**
   ```bash
   git push
   # or use Amplify console to redeploy
   ```

3. **Verify**
   - Recipe cards show images
   - Clicking recipe shows detail with image
   - Mobile nav works at bottom of screen

---

## 🐛 Troubleshooting

### Images Still Not Showing?
1. Check browser DevTools > Network tab for 403/404 errors
2. Verify S3 bucket allows public read access
3. Check CloudFront has correct origin configured
4. Inspect `VITE_IMAGE_BASE` value: `console.log(import.meta.env.VITE_IMAGE_BASE)`

### Mobile Nav Not Sticky?
- Clear cache: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
- Check `.shell` has `grid-template-columns: 1fr` on mobile

### API Calls Failing?
- Check `FORKPLAN_API` environment variable
- Dev mode: verify proxy in `vite.config.js`
- Prod: check Amplify rewrite rules

---

## 📚 Reference Files

- **API Config**: [vite.config.js](./vite.config.js)
- **Image Setup**: [src/api.js](./src/api.js#L8-L9)
- **Recipe Views**: [src/views/Recipes.jsx](./src/views/Recipes.jsx)
- **Mobile Styles**: [src/styles.css](./src/styles.css#L57-L60) (last media query)
- **Full Guide**: [CONFIGURATION.md](./CONFIGURATION.md)

