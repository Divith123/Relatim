/**
 * Backend utility for transforming image URLs from localhost to S3
 */

/**
 * Transforms localhost URLs to proper S3 URLs for production
 * @param {string} imageUrl - The image URL to transform
 * @returns {string} - The transformed URL or the original URL if no transformation needed
 */
function transformImageUrl(imageUrl) {
  if (!imageUrl) return null;
  
  // If it's already a proper S3 URL, return as is
  if (imageUrl.includes('supabase.co') && imageUrl.includes('/storage/v1/object/public/')) {
    return imageUrl;
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
  if (imageUrl && !imageUrl.includes('/') && (imageUrl.includes('.jpg') || imageUrl.includes('.png') || imageUrl.includes('.jpeg'))) {
    return `https://ckjmnfssukjyvamesysr.supabase.co/storage/v1/object/public/relatim-ai-uploads/profiles/${imageUrl}`;
  }
  
  // Return original URL if no transformation rules match
  return imageUrl;
}

/**
 * Transform image URLs in user object
 * @param {Object} user - User object that may contain image URLs
 * @returns {Object} - User object with transformed image URLs
 */
function transformUserImageUrls(user) {
  if (!user) return user;
  
  return {
    ...user,
    profile_photo: transformImageUrl(user.profile_photo)
  };
}

/**
 * Transform image URLs in message object
 * @param {Object} message - Message object that may contain image URLs
 * @returns {Object} - Message object with transformed image URLs
 */
function transformMessageImageUrls(message) {
  if (!message) return message;
  
  return {
    ...message,
    file_url: transformImageUrl(message.file_url),
    sender: message.sender ? transformUserImageUrls(message.sender) : message.sender
  };
}

/**
 * Transform image URLs in an array of objects
 * @param {Array} items - Array of items to transform
 * @param {string} type - Type of items ('user', 'message', etc.)
 * @returns {Array} - Array with transformed image URLs
 */
function transformArrayImageUrls(items, type = 'user') {
  if (!Array.isArray(items)) return items;
  
  return items.map(item => {
    switch (type) {
      case 'user':
        return transformUserImageUrls(item);
      case 'message':
        return transformMessageImageUrls(item);
      default:
        return item;
    }
  });
}

module.exports = {
  transformImageUrl,
  transformUserImageUrls,
  transformMessageImageUrls,
  transformArrayImageUrls
};