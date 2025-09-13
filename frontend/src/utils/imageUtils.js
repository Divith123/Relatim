/**
 * Transforms localhost URLs to proper S3 URLs for production
 * @param {string} imageUrl - The image URL to transform
 * @returns {string} - The transformed URL or the original URL if no transformation needed
 */
export const transformImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  
  // If it's already a proper S3 URL, check if it needs fixing
  if (imageUrl.includes('supabase.co')) {
    // Fix any malformed Supabase URLs
    if (imageUrl.includes('/storage/v1/object/public/relatim-ai-uploads/')) {
      return imageUrl;
    }
    // If it's a malformed Supabase URL, try to extract the filename
    const parts = imageUrl.split('/');
    const filename = parts[parts.length - 1];
    if (filename) {
      const folder = imageUrl.includes('profile') ? 'profiles' : 'profiles';
      return `https://ckjmnfssukjyvamesysr.supabase.co/storage/v1/object/public/relatim-ai-uploads/${folder}/${filename}`;
    }
  }
  
  // Transform localhost URLs to S3 URLs
  if (imageUrl.includes('localhost:5000/uploads/')) {
    const filename = imageUrl.split('/').pop();
    const folder = imageUrl.includes('/profiles/') ? 'profiles' : 
                   imageUrl.includes('/documents/') ? 'documents' : 
                   imageUrl.includes('/messages/') ? 'messages' : 'profiles';
    
    return `https://ckjmnfssukjyvamesysr.supabase.co/storage/v1/object/public/relatim-ai-uploads/${folder}/${filename}`;
  }
  
  // If it's a relative URL, prepend the S3 base URL
  if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('uploads/')) {
    const cleanUrl = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
    const pathParts = cleanUrl.split('/');
    const folder = pathParts[1] || 'profiles';
    const filename = pathParts[pathParts.length - 1];
    
    return `https://ckjmnfssukjyvamesysr.supabase.co/storage/v1/object/public/relatim-ai-uploads/${folder}/${filename}`;
  }
  
  // Handle direct filenames (assume they're profile images)
  if (imageUrl && !imageUrl.includes('/') && (imageUrl.includes('.jpg') || imageUrl.includes('.png'))) {
    return `https://ckjmnfssukjyvamesysr.supabase.co/storage/v1/object/public/relatim-ai-uploads/profiles/${imageUrl}`;
  }
  
  // Return original URL if no transformation rules match
  return imageUrl;
};

/**
 * Gets a fallback avatar URL based on user initials
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @returns {string} - A placeholder avatar URL
 */
export const getFallbackAvatarUrl = (firstName = '', lastName = '') => {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return `https://ui-avatars.com/api/?name=${initials}&background=10b981&color=fff&size=400`;
};

/**
 * Safe image URL getter that handles transformations and fallbacks
 * @param {string} imageUrl - The image URL
 * @param {string} firstName - User's first name for fallback
 * @param {string} lastName - User's last name for fallback
 * @returns {string} - A safe image URL
 */
export const getSafeImageUrl = (imageUrl, firstName = '', lastName = '') => {
  const transformedUrl = transformImageUrl(imageUrl);
  return transformedUrl || getFallbackAvatarUrl(firstName, lastName);
};