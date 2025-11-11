exports.handler = function(event, context, callback) {
    const origin = event.headers.origin || event.headers.Origin || '*';
    
    callback(null, {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        promptIfUnknown: true
      })
    });
  };