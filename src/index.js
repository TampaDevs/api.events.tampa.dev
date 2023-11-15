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


function returnMapsLink(address, city, state, postalCode) {
  // Construct the Google Maps link using the provided location details
  const formattedAddress = encodeURIComponent(`${address}, ${city}, ${state} ${postalCode}`);
  return `https://www.google.com/maps?q=${formattedAddress}`;
}


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

async function handleNextEventWidget(url) {
  const init = {
    headers: {
      'content-type': 'text/html',
    },
  };
  //await results of parseQueryParams
  const params = await parseQueryParams(url);
  //fetch jobBoardFeed, init
  const response = await fetch(jobBoardFeed, init);
  //boardData is awaiting response from the other
  const boardData = await gatherResponse(response);
  //if it has query params, return string of stuff
  console.log(params);

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

async function handleJsonEvents() {
  res = new Response(await env.kv.get("event_data"), { status: 200 });
  res.headers.set("Content-Type", "application/json");
  return res;
}

function handleCorsRequest() {
  var res = new Response(JSON.stringify({ message: 'Successfully added contact.' }), { status: 200 });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  return res;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  
  if (request.method == 'OPTIONS') {
    return handleCorsRequest();
  }
  
  if (url.pathname === '/') {
    return await handleJsonEvents();
  } else if (url.pathname === '/v1/widget/') {
    return await handleNextEventWidget(url);
  } else {
    return errorResponse(404, "Not found");
  }

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
