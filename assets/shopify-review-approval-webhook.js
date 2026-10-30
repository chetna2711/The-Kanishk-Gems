/**
 * ==============================================================================
 * KANISHK GEMS / HENCY JEWELS - 100% FREE AUTOMATED REVIEW APPROVAL WORKFLOW
 * ==============================================================================
 * 
 * HOW IT WORKS:
 * 1. Customer fills review form on product page with rating, text, and photos.
 * 2. This Google Apps Script receives the review and customer photos.
 * 3. The photos are saved safely to your Google Drive folder.
 * 4. An email is sent to your email (chetna.kanak2711@gmail.com) with review & photos.
 * 5. In your email, you see a green button: [ ✅ APPROVE & PUBLISH TO SHOPIFY ].
 * 6. You click the button from phone or PC -> This script automatically
 *    appends the review into your Shopify Product Metafield (`custom.customer_reviews`).
 * 7. The review and photos are now live on your store for all customers!
 * ==============================================================================
 */

// ======================== ⚙️ CONFIGURATION ========================
const SHOPIFY_STORE_DOMAIN = '1ei9gp-rt.myshopify.com';

// 🔑 AUTHENTICATION (Dev Dashboard: Client ID & Secret)
const SHOPIFY_CLIENT_ID = '';
const SHOPIFY_CLIENT_SECRET = ''; // Deployed in Google Apps Script

// Optional: Static Admin Token if available
const SHOPIFY_ADMIN_ACCESS_TOKEN = '';

// 📧 YOUR STORE NOTIFICATION EMAIL:
const STORE_OWNER_EMAIL = 'chetna.kanak2711@gmail.com';
const SHOPIFY_API_VERSION = '2024-01';
// ==================================================================

/**
 * Handles incoming review submissions from the Shopify Product Page Form
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const productId = String(postData.productId || '');
    const productTitle = postData.productTitle || 'Product';
    const author = postData.author || 'Anonymous';
    const email = postData.email || '';
    const rating = parseInt(postData.rating || 5, 10);
    const title = postData.title || '';
    const content = postData.content || '';
    const location = postData.location || '';
    const rawPhotos = postData.photos || [];

    if (!productId) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Missing product ID' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Save uploaded photos to Google Drive and get permanent public URLs
    const publicPhotoUrls = [];
    if (Array.isArray(rawPhotos) && rawPhotos.length > 0) {
      let folder;
      const folderName = 'Kanishk Gems Customer Reviews';
      const existingFolders = DriveApp.getFoldersByName(folderName);
      if (existingFolders.hasNext()) {
        folder = existingFolders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }

      rawPhotos.forEach(function (dataUrl, idx) {
        try {
          if (dataUrl && dataUrl.indexOf('data:image') === 0) {
            const parts = dataUrl.split(',');
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const base64Data = parts[1];
            const decodedBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, 'review_' + productId + '_' + Date.now() + '_' + (idx + 1) + '.jpg');
            const file = folder.createFile(decodedBlob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            const directUrl = 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1000';
            publicPhotoUrls.push(directUrl);
          } else if (dataUrl && dataUrl.indexOf('http') === 0) {
            publicPhotoUrls.push(dataUrl);
          }
        } catch (imgErr) {
          console.error('Error saving image:', imgErr);
        }
      });
    }

    // 2. Generate Unique Review Object & Save in Script Storage
    const reviewId = postData.id ? String(postData.id) : ('rev_' + Utilities.getUuid().substring(0, 8));
    const reviewPayload = {
      id: reviewId,
      productId: productId,
      productTitle: productTitle,
      author: author,
      email: email,
      rating: rating,
      date: Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd MMM yyyy'),
      verified: true,
      location: location,
      title: title,
      content: content,
      photos: publicPhotoUrls,
      helpful_count: 0
    };

    // 2. Save directly into Cloud Storage (Instant live for all guest users & visitors)
    const prodKey = 'approved_reviews_' + productId;
    let prodReviews = [];
    try {
      const existing = PropertiesService.getScriptProperties().getProperty(prodKey);
      if (existing) prodReviews = JSON.parse(existing);
    } catch (e) { prodReviews = []; }

    // Deduplicate by ID and content signature
    prodReviews = prodReviews.filter(function (r) {
      if (r.id === reviewPayload.id) return false;
      if (r.author === reviewPayload.author && (r.title || '') === (reviewPayload.title || '') && (r.content || '') === (reviewPayload.content || '')) return false;
      return true;
    });
    prodReviews.unshift(reviewPayload);
    PropertiesService.getScriptProperties().setProperty(prodKey, JSON.stringify(prodReviews));

    // 3. Sync directly into Shopify Product Metafield (`custom.customer_reviews`)
    let metafieldNotice = '';
    try {
      const metaRes = publishReviewToShopifyMetafield(reviewPayload);
      if (metaRes && metaRes.success) {
        metafieldNotice = '<br/><span style="color: #27ae60; font-weight: bold;">✅ Successfully synced to Shopify Product Metafield (custom.customer_reviews)!</span>';
      } else if (metaRes && metaRes.error) {
        metafieldNotice = '<br/><span style="color: #e67e22; font-size: 13px;">⚠️ Metafield notice: ' + metaRes.error + '</span>';
      }
    } catch (shopifyErr) {
      metafieldNotice = '<br/><span style="color: #e74c3c; font-size: 13px;">⚠️ Metafield notice: ' + shopifyErr.toString() + '</span>';
    }

    // 4. Construct 1-Click Delete Link (in case store owner wants to remove spam)
    const scriptUrl = ScriptApp.getService().getUrl();
    const deleteUrl = scriptUrl + '?action=deleteReview&productId=' + encodeURIComponent(productId) + '&id=' + encodeURIComponent(reviewId);

    // 5. Send Notification Email to Store Owner
    let photosHtml = '';
    if (publicPhotoUrls.length > 0) {
      photosHtml = '<div style="margin-top: 15px;"><strong>Customer Photos:</strong><br/>';
      publicPhotoUrls.forEach(function (url) {
        photosHtml += '<a href="' + url + '" target="_blank"><img src="' + url + '" style="width: 130px; height: 130px; object-fit: cover; border-radius: 8px; margin: 8px 8px 0 0; border: 1.5px solid #c5a059;" /></a>';
      });
      photosHtml += '</div>';
    }

    const starString = '★'.repeat(rating) + '☆'.repeat(5 - rating);

    const emailHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fafaf7; border: 1.5px solid #c5a059; border-radius: 10px; overflow: hidden;">'
      + '<div style="background: #1a1a1a; padding: 20px; text-align: center; color: #ffffff;">'
      + '<h2 style="color: #c5a059; margin: 0; letter-spacing: 2px;">KANISHK GEMS</h2>'
      + '<p style="margin: 5px 0 0; font-size: 13px; color: #e0c890;">New Customer Review Published & Live</p>'
      + '</div>'
      + '<div style="padding: 25px; background: #ffffff;">'
      + '<p style="margin: 0 0 10px; font-size: 14px; color: #666;">Product:</p>'
      + '<h3 style="margin: 0 0 15px; color: #1a1a1a;">' + productTitle + ' (ID: ' + productId + ')</h3>'
      + '<div style="background: #fafaf7; border-left: 4px solid #c5a059; padding: 15px; margin-bottom: 20px; border-radius: 4px;">'
      + '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">'
      + '<strong style="font-size: 16px; color: #1a1a1a;">' + author + '</strong>'
      + '<span style="color: #27ae60; font-weight: bold; font-size: 12px;">✓ Published Live</span>'
      + '</div>'
      + '<p style="margin: 0 0 8px; color: #777; font-size: 13px;">' + (location ? location + ' • ' : '') + 'Email: ' + email + '</p>'
      + '<div style="color: #c5a059; font-size: 18px; margin-bottom: 8px;">' + starString + ' (' + rating + '/5)</div>'
      + (title ? '<h4 style="margin: 0 0 6px; font-size: 15px; color: #1a1a1a;">"' + title + '"</h4>' : '')
      + '<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #333;">' + content + '</p>'
      + photosHtml
      + '</div>'
      + metafieldNotice
      + '<div style="text-align: center; margin: 30px 0 10px;">'
      + '<a href="https://' + SHOPIFY_STORE_DOMAIN + '/products/' + productId + '" target="_blank" style="background: #1a1a1a; color: #c5a059; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 12px;">'
      + '👁️ View on Store'
      + '</a>'
      + '<a href="' + deleteUrl + '" style="background: #e74c3c; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">'
      + '🗑️ Delete Review'
      + '</a>'
      + '</div>'
      + '<p style="text-align: center; font-size: 12px; color: #888; margin-top: 15px;">'
      + 'This review is now live in Cloud & Shopify Metafields. Click "Delete Review" if this was spam.'
      + '</p>'
      + '</div>'
      + '</div>';

    MailApp.sendEmail({
      to: STORE_OWNER_EMAIL,
      subject: '⭐ New Customer Review Published for: ' + productTitle,
      htmlBody: emailHtml
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Review published to cloud and synced to Shopify' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('doPost error:', error);
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles:
 * 1. 1-Click Approval / Rejection from Store Owner's Email Link
 * 2. Fetching approved reviews on the Product Page (action=getReviews)
 */
function doGet(e) {
  try {
    // ==========================================
    // 0. OAuth Callback: Auto-capture Token from Shopify
    // ==========================================
    if (e && e.parameter && e.parameter.code) {
      const code = e.parameter.code;
      const tokenUrl = 'https://' + SHOPIFY_STORE_DOMAIN + '/admin/oauth/access_token';
      try {
        const tokenResp = UrlFetchApp.fetch(tokenUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            client_id: SHOPIFY_CLIENT_ID,
            client_secret: SHOPIFY_CLIENT_SECRET,
            code: code
          }),
          muteHttpExceptions: true
        });
        const tokenData = JSON.parse(tokenResp.getContentText());
        if (tokenData && tokenData.access_token) {
          PropertiesService.getScriptProperties().setProperty('SHOPIFY_PERMANENT_TOKEN', tokenData.access_token);
          return HtmlService.createHtmlOutput('<div style="font-family: Arial, sans-serif; max-width: 550px; margin: 50px auto; text-align: center; padding: 40px; border: 2px solid #27ae60; border-radius: 12px; background: #fafaf7;"><div style="font-size: 55px; margin-bottom: 12px;">🎉</div><h2 style="color: #27ae60; margin: 0 0 10px;">Successfully Connected to Shopify!</h2><p style="color: #333; font-size: 16px;">Permanent Admin API token saved.</p><p style="color: #666; font-size: 14px;">Customer reviews will now automatically sync to your Product Metafields (custom.customer_reviews)!</p></div>');
        } else {
          return HtmlService.createHtmlOutput('<h3>Token error: ' + tokenResp.getContentText() + '</h3>');
        }
      } catch (tokenErr) {
        return HtmlService.createHtmlOutput('<h3>Authorization error: ' + tokenErr.toString() + '</h3>');
      }
    }

    const action = e.parameter ? e.parameter.action : '';
    const reviewId = e.parameter ? e.parameter.id : '';
    const productId = e.parameter ? e.parameter.productId : '';

    // ==========================================
    // 1. API: Return Approved Reviews to Storefront
    // ==========================================
    if (action === 'getReviews') {
      const targetProdId = String(productId || '').trim();
      let approvedList = [];

      try {
        const key = targetProdId ? ('approved_reviews_' + targetProdId) : 'approved_reviews_all';
        const raw = PropertiesService.getScriptProperties().getProperty(key);
        if (raw) approvedList = JSON.parse(raw);
      } catch (err) {
        approvedList = [];
      }

      return ContentService.createTextOutput(JSON.stringify(approvedList))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 2. Action: Delete Review (Store Owner Management)
    // ==========================================
    if (action === 'deleteReview') {
      const targetProdId = String(productId || '').trim();
      const targetReviewId = String(reviewId || '').trim();

      if (!targetProdId || !targetReviewId) {
        return HtmlService.createHtmlOutput('<h3>Missing product ID or review ID</h3>');
      }

      const key = 'approved_reviews_' + targetProdId;
      let list = [];
      try {
        const raw = PropertiesService.getScriptProperties().getProperty(key);
        if (raw) list = JSON.parse(raw);
      } catch (e) { list = []; }

      list = list.filter(function (r) { return r.id !== targetReviewId; });
      PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(list));

      return HtmlService.createHtmlOutput('<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; text-align: center; padding: 35px; border: 2px solid #e74c3c; border-radius: 12px; background: #fff;"><div style="font-size: 40px; margin-bottom: 10px;">🗑️</div><h2 style="color: #e74c3c; margin: 0 0 10px;">Review Deleted Successfully!</h2><p style="color: #555; font-size: 15px;">The review has been removed. It will no longer show on the product page.</p></div>');
    }

    // ==========================================
    // 3. Email Action: Approve or Reject Review
    // ==========================================
    if (!reviewId) {
      return HtmlService.createHtmlOutput('<h3>Invalid request: Missing review ID</h3>');
    }

    const reviewJson = PropertiesService.getScriptProperties().getProperty(reviewId);
    if (!reviewJson) {
      return HtmlService.createHtmlOutput('<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; text-align: center; padding: 30px; border: 1px solid #ddd; border-radius: 10px;"><h2 style="color: #27ae60;">Already Approved!</h2><p>This review has already been approved and is live on your store.</p></div>');
    }

    const reviewData = JSON.parse(reviewJson);

    // If Rejected
    if (action === 'reject') {
      PropertiesService.getScriptProperties().deleteProperty(reviewId);
      return HtmlService.createHtmlOutput('<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; text-align: center; padding: 30px; border: 1.5px solid #e74c3c; border-radius: 10px;"><h2 style="color: #e74c3c;">❌ Review Rejected</h2><p>Review by <strong>' + reviewData.author + '</strong> was rejected and will NOT be published to your store.</p></div>');
    }

    // If Approved
    if (action === 'approve') {
      // 1. Save to permanent Cloud storage for instant storefront display
      const prodKey = 'approved_reviews_' + reviewData.productId;
      let prodReviews = [];
      try {
        const existing = PropertiesService.getScriptProperties().getProperty(prodKey);
        if (existing) prodReviews = JSON.parse(existing);
      } catch (e) { prodReviews = []; }

      const cleanObj = {
        id: reviewData.id,
        author: reviewData.author,
        rating: reviewData.rating,
        date: reviewData.date,
        verified: true,
        location: reviewData.location,
        title: reviewData.title,
        content: reviewData.content,
        photos: reviewData.photos || [],
        helpful_count: 0
      };

      prodReviews.unshift(cleanObj);
      PropertiesService.getScriptProperties().setProperty(prodKey, JSON.stringify(prodReviews));
      PropertiesService.getScriptProperties().deleteProperty(reviewId);

      // 2. Also attempt Shopify Metafield sync in background (if token available)
      let metafieldStatus = '';
      try {
        const metaRes = publishReviewToShopifyMetafield(reviewData);
        if (metaRes && metaRes.success) {
          metafieldStatus = ' (Also synced to Shopify Metafields!)';
        }
      } catch (shopifyErr) {
        console.warn('Metafield sync notice:', shopifyErr);
      }

      return HtmlService.createHtmlOutput('<div style="font-family: Arial, sans-serif; max-width: 550px; margin: 50px auto; text-align: center; padding: 35px; border: 2px solid #27ae60; border-radius: 12px; background: #fafaf7;"><div style="font-size: 50px; margin-bottom: 10px;">🎉</div><h2 style="color: #27ae60; margin: 0 0 10px;">Review Approved & Published!</h2><p style="font-size: 16px; color: #333; margin: 0 0 15px;">The review by <strong>' + reviewData.author + '</strong> (' + reviewData.rating + ' Stars) has been successfully published to <strong>' + reviewData.productTitle + '</strong>' + metafieldStatus + '.</p><p style="font-size: 14px; color: #666; margin-bottom: 25px;">It is now live on your store\'s product page!</p><a href="https://' + SHOPIFY_STORE_DOMAIN + '/products/' + reviewData.productId + '" target="_blank" style="background: #1a1a1a; color: #c5a059; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View On Store ➜</a></div>');
    }

    return HtmlService.createHtmlOutput('<h3>Unknown action</h3>');

  } catch (err) {
    return HtmlService.createHtmlOutput('<h3>Notice: ' + err.toString() + '</h3>');
  }
}

/**
 * Helper to get Shopify Admin Access Token
 * Works seamlessly with Dev Dashboard Client ID/Secret OR static token
 */
function getShopifyAccessToken() {
  const savedToken = PropertiesService.getScriptProperties().getProperty('SHOPIFY_PERMANENT_TOKEN');
  if (savedToken && savedToken.length > 5) {
    return savedToken;
  }

  if (SHOPIFY_ADMIN_ACCESS_TOKEN && SHOPIFY_ADMIN_ACCESS_TOKEN.indexOf('PASTE_') !== 0 && SHOPIFY_ADMIN_ACCESS_TOKEN.length > 5) {
    return SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  if (SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET) {
    const tokenUrl = 'https://' + SHOPIFY_STORE_DOMAIN + '/admin/oauth/access_token';
    const payload = {
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    };

    // Try application/x-www-form-urlencoded first
    let resp = UrlFetchApp.fetch(tokenUrl, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });

    let rawText = resp.getContentText();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      // Try application/json
      resp = UrlFetchApp.fetch(tokenUrl, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      rawText = resp.getContentText();
      try {
        data = JSON.parse(rawText);
      } catch (e2) {
        throw new Error('Shopify returned: ' + rawText.substring(0, 250));
      }
    }

    if (data && data.access_token) {
      return data.access_token;
    }
    throw new Error('Shopify token error: ' + rawText);
  }

  throw new Error('Please configure either SHOPIFY_CLIENT_SECRET or SHOPIFY_ADMIN_ACCESS_TOKEN.');
}

/**
 * GraphQL call to Shopify Admin API to fetch existing reviews and append the new review
 */
function publishReviewToShopifyMetafield(newReview) {
  const shopifyGqlUrl = 'https://' + SHOPIFY_STORE_DOMAIN + '/admin/api/' + SHOPIFY_API_VERSION + '/graphql.json';
  const productGid = 'gid://shopify/Product/' + newReview.productId;
  const accessToken = getShopifyAccessToken();

  // Step 1: Query current metafield value
  const query = 'query getProductReviews { product(id: "' + productGid + '") { metafield(namespace: "custom", key: "customer_reviews") { value } } }';

  const fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Shopify-Access-Token': accessToken
    },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(shopifyGqlUrl, fetchOptions);
  const jsonResp = JSON.parse(response.getContentText());

  let existingList = [];
  try {
    const mfValue = jsonResp.data.product.metafield ? jsonResp.data.product.metafield.value : null;
    if (mfValue) {
      existingList = JSON.parse(mfValue);
      if (typeof existingList === 'string') existingList = JSON.parse(existingList);
    }
  } catch (parseErr) {
    existingList = [];
  }

  // Step 2: Append clean review object
  const cleanReviewObj = {
    id: newReview.id,
    author: newReview.author,
    rating: newReview.rating,
    date: newReview.date,
    verified: true,
    location: newReview.location,
    title: newReview.title,
    content: newReview.content,
    photos: newReview.photos || [],
    helpful_count: 0
  };

  existingList.unshift(cleanReviewObj);

  // Step 3: Mutation to update metafield
  const updateMutation = 'mutation setProductReviewMetafield($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id key } userErrors { field message } } }';

  const mutationVariables = {
    metafields: [
      {
        ownerId: productGid,
        namespace: "custom",
        key: "customer_reviews",
        type: "json",
        value: JSON.stringify(existingList)
      }
    ]
  };

  const updateOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Shopify-Access-Token': accessToken
    },
    payload: JSON.stringify({ query: updateMutation, variables: mutationVariables }),
    muteHttpExceptions: true
  };

  const updateResp = UrlFetchApp.fetch(shopifyGqlUrl, updateOptions);
  const updateJson = JSON.parse(updateResp.getContentText());

  if (updateJson.data && updateJson.data.metafieldsSet) {
    const errors = updateJson.data.metafieldsSet.userErrors;
    if (errors && errors.length > 0) {
      return { success: false, error: errors.map(function (e) { return e.message; }).join(', ') };
    }
    return { success: true };
  } else {
    return { success: false, error: 'Shopify API update error: ' + updateResp.getContentText() };
  }
}
