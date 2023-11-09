import Handlebars from 'handlebars/runtime.js';

import '../assets/pages.js';
import '../assets/partials.js';

import { hbsAsyncRender, registerAsyncHelper } from "hbs-async-render";

function formatAddress(venue) {
  // Extract the address components from the venue object
  const { name, address, city, state, postalCode } = venue;

  // Create the formatted address string
  const formattedAddress = `${address}, ${city}, ${state}, ${postalCode}`;

  return formattedAddress;
}

function formatDate(date) {
  const optionsDate = {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  };

  const optionsTime = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };

  const datePart = date.toLocaleDateString('en-US', optionsDate);
  const timePart = date.toLocaleTimeString('en-US', optionsTime);

  return `${datePart} at ${timePart}`;
}

const jobBoardFeed = 'https://events.api.tampa.dev/';

//async helper func that capitalizes crap
registerAsyncHelper(Handlebars, 'capitalize', function (options, context) {
  return new Promise((resolve, reject) => {
    resolve(options.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()));
  });
});
//adds utm source whatever that means - specific for job board
registerAsyncHelper(Handlebars, 'add_utm', function (options, context) {
  return new Promise((resolve, reject) => {
    resolve(options + "?utm_source=job_board_widget_v1&utm_medium=organic&utm_campaign=tdjobs_external_embed");
  });
});
//truncates to 32 characters
registerAsyncHelper(Handlebars, 'truncate', function (options, context) {
  return new Promise((resolve, reject) => {
    resolve(options.replace(/^(.{32}[^\s]*).*/, "$1") + "...");
  });
});
//formats title
registerAsyncHelper(Handlebars, 'title_fmt', function (options, context) {
  return new Promise((resolve, reject) => {
    resolve(options.length > 40 ? options.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()).replace(/^(.{32}[^\s]*).*/, "$1") + "..." : options);
  });
});


function returnMapsLink(address, city, state, postalCode) {
  // Construct the Google Maps link using the provided location details
  const formattedAddress = encodeURIComponent(`${address}, ${city}, ${state} ${postalCode}`);
  return `https://www.google.com/maps?q=${formattedAddress}`;
}
//formats google maps link
registerAsyncHelper(Handlebars, 'get_maps', function (options, context) {
  return new Promise((resolve, reject) => {
    resolve(returnMapsLink(options['address'], options['city'], options['state'], options['postalCode']));
  });
});


//formats date
registerAsyncHelper(Handlebars, 'extract_date', function (options, context) {
  return new Promise((resolve, reject) => {
    resolve(new Date(options).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));
  });
});


//async funct for getting the query strings out of a url
async function parseQueryParams(url) {
  const params = {};
  const queryString = url.search.slice(1).split('&')
  queryString.forEach(item => {
    const kv = item.split('=')
    if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1]) || true
  });
  return params;
}



//gets content type from headers, then parses the response / formats based on
// the return value from the api it is hitting. 
async function gatherResponse(response) {
  const { headers } = response;
  const contentType = headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('application/vnd.api+json')) {
    return await response.json();
  }
  return await response.text();
}
//creates error response -  for if the url is not /v1/widget.
//creates headers etc for the return value and create new response that is returned from rendering the error page
async function errorResponse(status, message) {
  const resMeta = {
    headers: {
      'content-type': 'text/html',
    },
    status: status
  };
  return new Response(await hbsAsyncRender(Handlebars, 'error', { error_message: message, error_status: status }), resMeta);
}
//filter field based on params
async function filterTopLevelField(jsonData, fieldName) {
  try {
    const parsedData = await JSON.parse(jsonData);
    if (typeof parsedData === 'object' && fieldName in parsedData) {
      const filteredData = { [fieldName]: parsedData[fieldName] };
      return filteredData;
    } else {
      return {};
    }
  } catch (error) {
    console.error('Invalid JSON data.', error);
    return JSON.stringify({});
  }
}

//check if object is empty
function isObjectNotEmpty(obj) {
  return Object.keys(obj).length > 0;
}


async function handleRequest(request) {
  //establish headers
  const init = {
    headers: {
      'content-type': 'text/html',
    },
  };
  //declare url to check if it isnt the correct path
  const url = new URL(request.url);
  //if url is not /v1/widget, throw not found error
  if (url.pathname !== '/v1/widget/')
    return errorResponse(404, "Not found");
  //await results of parseQueryParams
  const params = await parseQueryParams(url);
  //fetch jobBoardFeed, init
  const response = await fetch(jobBoardFeed, init);
  //boardData is awaiting response from the other
  const boardData = await gatherResponse(response);
  //if it has query params, return string of stuff
  console.log(params);
  /** 
    if (isObjectNotEmpty(params)){
        const jsonCorsHeaders = {
          headers: {
              'content-type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET'
          },
        };
        //check this path down the road - for now focus on tdevs one
        console.log("HERE");
        const filteredData= await filterTopLevelField(boardData, Object.values(params)[0]);
        console.log("HERE");
        console.log(await JSON.stringify(filteredData));
        return new Response(await JSON.stringify(boardData["tampadevs"]), jsonCorsHeaders);
        //else log boardData etc
    } else {
      **/


  const filteredData = await filterTopLevelField(JSON.stringify(boardData), Object.values(params)[0]);
  //console.log(await JSON.stringify(filteredData))
  //console.log(await JSON.stringify(filteredData['tampadevs']['eventSearch']['edges']))

  const TD = filteredData['tampadevs'];

  const date = new Date(TD['eventSearch']['edges'][0]['node']['dateTime']);
  const dayNumber = date.getDate();
  const month = date.toLocaleString('default', { month: 'short' });

  const address = formatAddress(TD['eventSearch']['edges'][0]['node']['venue']);
  const encodedAddress = encodeURIComponent(address);
  const googleMapsUrl = `https://www.google.com/maps?q=${encodedAddress}`;

  const event = {
    name: TD['name'],
    date: formatDate(date),
    dayNumber: dayNumber,
    googleMapsUrl: googleMapsUrl,
    month: month,
    address: address,
    node: TD['eventSearch']['edges'][0]['node'],
  };

  const eventString = JSON.stringify(event, null, 2);

  return new Response(
    await hbsAsyncRender(
      Handlebars,
      'widget', {
      event: event,
      eventString: eventString,
      meetupDetails: filteredData,
      meetupDetailsString: JSON.stringify(filteredData, null, 2),
      url_params: params,
    }),
    init
  );

}

addEventListener('fetch', event => {
  return event.respondWith(handleRequest(request).catch(
    (err) => errorResponse(500, "We had a problem.")
  ));
});

export default {
  async fetch(request, env) {
    return await handleRequest(request).catch(
      (err) => errorResponse(500, "We had a problem.")
    )
  }
}
