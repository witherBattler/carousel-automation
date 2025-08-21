const fetch = require("node-fetch")
const fs = require('fs');


async function checkContentPublishingLimit(userId, accessToken) {
  const response = await fetch(`https://graph.instagram.com/me/content_publishing_limit`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + accessToken
    },
  })
  const data = await response.json()
  return 100-data.data[0].quota_usage
}

async function createInstagramPost(userId, accessToken, saveId, caption) {
  console.log('📱 Creating Instagram post with caption:', caption ? `"${caption.substring(0, 50)}..."` : 'No caption');
  
  const files = fs.readdirSync(`./outputs/${saveId}`)
    .filter(file => file.match(/\.(jpg|jpeg|png)$/i)) // Only image files
    .sort((a, b) => {
      // Sort by numeric order (1.jpg, 2.jpg, etc.)
      const aNum = parseInt(a.split('.')[0]);
      const bNum = parseInt(b.split('.')[0]);
      return aNum - bNum;
    });

  console.log('📸 Found image files:', files);

  const igContainers = await Promise.all(files.map(async (file, index) => {
    const imageUrl = process.env.URL_BASE + "/outputs/" + saveId + "/" + file
    console.log(`🖼️ Creating container for image ${index + 1}: ${imageUrl}`);
    
    try {
      const response = await fetch(`https://graph.instagram.com/me/media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken
        },
        body: new URLSearchParams({
          image_url: imageUrl,
          is_carousel_item: true
        })
      })
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        console.error(`❌ Error creating container for ${file}:`, data);
        throw new Error(data.error?.message || 'Failed to create media container');
      }
      
      console.log(`✅ Created container for ${file}:`, data.id);
      return {
        index: parseInt(file.split(".")[0]),
        id: data.id,
        file: file
      }
    } catch(error) {
      console.error(`❌ Error processing ${file}:`, error);
      throw error; // Re-throw to fail the whole process
    }
  }))

  // Filter out any null/undefined results and sort by index
  const validContainers = igContainers
    .filter(container => container && container.id)
    .sort((a, b) => a.index - b.index);

  console.log('📦 Valid containers created:', validContainers.length, 'out of', files.length);
  
  if (validContainers.length === 0) {
    throw new Error('No valid media containers were created');
  }

  // Create carousel container with caption
  const carouselPayload = {
    media_type: "CAROUSEL",
    children: validContainers.map(container => container.id).join(",")
  };
  
  // Only add caption if it's provided and not empty
  if (caption && caption.trim()) {
    carouselPayload.caption = caption.trim();
    console.log('📝 Adding caption to carousel:', caption.trim().substring(0, 100) + '...');
  } else {
    console.log('📝 No caption provided for carousel');
  }
  
  console.log('🎠 Creating carousel container with children:', carouselPayload.children);
  
  const carouselContainerResponse = await fetch("https://graph.instagram.com/me/media", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + accessToken
    },
    body: new URLSearchParams(carouselPayload)
  })
  
  const carouselContainer = await carouselContainerResponse.json()
  
  console.log('🎠 Carousel container response:', carouselContainer);
  
  if (!carouselContainerResponse.ok || carouselContainer.error) {
    console.error('❌ Error creating carousel container:', carouselContainer);
    throw new Error(carouselContainer.error?.message || 'Failed to create carousel container');
  }

  // Finally, publish the carousel
  console.log('🚀 Publishing carousel to Instagram...');
  
  const postDataResponse = await fetch("https://graph.instagram.com/me/media_publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + accessToken
    },
    body: new URLSearchParams({
      creation_id: carouselContainer.id
    })
  })
  
  const postData = await postDataResponse.json()
  
  console.log('📱 Publish response:', postData);
  
  if (!postDataResponse.ok || postData.error) {
    console.error('❌ Error publishing post:', postData);
    throw new Error(postData.error?.message || 'Failed to publish post');
  }
  
  console.log('✅ Successfully published Instagram post:', postData.id);
  return postData.id
  
}

module.exports = {checkContentPublishingLimit, createInstagramPost}