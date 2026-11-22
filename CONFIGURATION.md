# Forkplan React Configuration Guide

## 1. Backend API Configuration

**Location**: `vite.config.js` (line 5)

The backend API endpoint is configured via the `FORKPLAN_API` environment variable:

```javascript
const API = process.env.FORKPLAN_API || 'https://kt7490x9c3.execute-api.eu-west-2.amazonaws.com/dev';
```

### Setting the Backend API:
- **Development**: The app proxies all `/api` requests through the dev server to avoid CORS issues
- **Production (Amplify)**: Set the `FORKPLAN_API` environment variable in Amplify console
  - Or add an Amplify rewrite rule to handle `/api` redirects

### Environment Variable:
```bash
export FORKPLAN_API=https://your-backend-api.com
```

---

## 2. S3 Image Base Configuration

**Location**: Environment variable `VITE_IMAGE_BASE`

This tells the app where to load recipe images from.

### Configuration:
Create a `.env` file in the project root:

```env
VITE_IMAGE_BASE=https://your-cloudfront-url.cloudfront.net
# OR
VITE_IMAGE_BASE=https://your-bucket.s3.eu-west-2.amazonaws.com
```

### Important:
- Must be an **HTTPS URL**, not `s3://` protocol
- Do **NOT** include a trailing slash
- Should be a CloudFront distribution URL for better performance

### How it works:
1. Recipe images are stored with a `image_key` (e.g., `recipes/abc123.jpg`)
2. The full URL is constructed as: `{VITE_IMAGE_BASE}/{image_key}`
3. Used in [api.js](/Users/kevinmason/workspace/forklplan/forkplan-react/src/api.js:9) via `imageUrl()` function

### Production (Amplify):
Set in Amplify environment variables:
- Navigate to App Settings > Build settings > Environment variables
- Add: `VITE_IMAGE_BASE=https://your-cloudfront-url.cloudfront.net`

---

## 3. Mobile Navigation Improvements

**Location**: `src/styles.css` (media query at end)

### Recent Improvements:
- Navigation fixed to bottom of screen on mobile
- Sticky positioning ensures it stays accessible while scrolling
- Main content padded at bottom to prevent overlap
- Horizontal scrolling for long nav menus

### CSS Changes:
```css
nav.side {
  position: fixed;      /* Fixed to bottom */
  bottom: 0;
  left: 0;
  right: 0;
  flex-direction: row;  /* Horizontal layout */
  overflow-x: auto;     /* Scrollable nav */
  z-index: 40;
}

main {
  padding-bottom: 76px; /* Prevent content hiding under nav */
}
```

---

## 4. Recipe Detail Images

**Location**: `src/views/Recipes.jsx` (line 7 in Detail component)

Images are already displayed in recipe details:

```jsx
{imageUrl(r.image_key) && <img className="thumb" src={imageUrl(r.image_key)} alt="" />}
```

### How it works:
1. When you open a recipe detail modal
2. The `Detail` component checks if `r.image_key` exists
3. Calls `imageUrl(r.image_key)` to generate the full S3 URL
4. Displays the image using the `.thumb` CSS class

### Image Classes:
- `.thumb` - styles recipe images with 16:10 aspect ratio, rounded corners, and fallback emoji
- Lazy loaded on recipe list cards for performance

### Troubleshooting Missing Images:
1. Check `VITE_IMAGE_BASE` is set correctly
2. Verify S3/CloudFront bucket contains the image at `{base}/{image_key}`
3. Check browser console for 403/404 errors
4. Ensure S3 bucket has public read permissions (or CloudFront signed URLs)

---

## Development vs Production

### Development:
```bash
# Create .env.local or .env
VITE_IMAGE_BASE=http://localhost:9000  # local S3 mock or test server
FORKPLAN_API=http://localhost:8000     # local backend

npm run dev
```

### Production (AWS Amplify):
1. Set `VITE_IMAGE_BASE` in Amplify console
2. Set `FORKPLAN_API` if not using default
3. Deploy via `git push` or Amplify console
4. Build uses `npm run build` which bundles all env variables

---

## Testing Image Configuration

### Manual Test:
1. Visit Recipes page
2. Click "Copy from Catalog" or view a recipe with an image_key
3. Click on a recipe card to open the detail modal
4. Image should display if:
   - `VITE_IMAGE_BASE` is set
   - S3/CloudFront has the image
   - Image URL is accessible

### Debug in Browser Console:
```javascript
// Check if IMAGE_BASE is set:
import { imageUrl } from './api.js';
imageUrl('recipes/test.jpg');  // Should output full HTTPS URL
```

