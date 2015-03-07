/**
 * Module dependencies.
 */

require('newrelic');
var express = require('express');
Instagram = require('instagram-node-lib');
var bodyParser = require('body-parser');
var request = require("request");
async = require("async")
var cors = require('cors')

Instagram.set('client_id', process.env.INSTAGRAM_CLIENT_ID);
Instagram.set('client_secret', process.env.INSTAGRAM_CLIENT_SECRET);

Instagram.set('maxSockets',  50);

var foursquare = require('node-foursquare-venues')
                (process.env.FOURSQUARE_CLIENT_ID, 
                 process.env.FOURSQUARE_CLIENT_SECRET)

var yelp = require("yelp").createClient({
  consumer_key: process.env.YELP_CONSUMER_KEY,
  consumer_secret: process.env.YELP_CONSUMER_SECRET ,
  token: process.env.YELP_TOKEN,
  token_secret: process.env.YELP_TOKEN_SECRET 
});


var app = module.exports = express();
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());
app.use(cors());


// create an error with .status. we
// can then use the property in our
// custom error handler (Connect repects this prop as well)
function error(status, msg) {
  var err = new Error(msg);
  err.status = status;
  return err;
}

// here we validate the API key,
// by mounting this middleware to /api
// meaning only paths prefixed with "/api"
// will cause this middleware to be invoked

app.use('/api', function(req, res, next){
  var key = 'Aj2lC55I3l50D965Z6xpvzkcML3OJF36'

  // key isn't present
  if (!key) return next(error(400, 'api key required'));

  // key is invalid
  if (!~apiKeys.indexOf(key)) return next(error(401, 'invalid api key'));

  // all good, store req.key for route access
  req.key = key;
  next();
});

// map of valid api keys, typically mapped to
// account info with some sort of database like redis.
// api keys do _not_ serve as authentication, merely to
// track API usage or help prevent malicious behavior etc.
var apiKeys = [process.env.API_KEY];


// we now can assume the api key is valid,
// and simply expose the data
app.get('/api', function(req, res, next){
  res.send('Hello this is Coffigram api speaking!');
});


/*
* Match foursquare venue to the instagram location. 
* 
*/
var get_instagram_loc_id = function(venue, callback) {
  Instagram.locations.search({ 
    foursquare_v2_id: venue.id,
    complete: function(data){
      return callback(null, data);
    }
    // error: function(errorMessage, errorObject, caller) {
    //   console.log(errorMessage);
    //   return callback(errorObject, null);
    //     // errorMessage is the raised error message
    //     // errorObject is either the object that caused the issue, or the nearest neighbor
    //     // caller is the method in which the error occurred
    // }
  });
}

/*
* Get a location ID and return all the media
* items that were taken in that place.
*/
var get_media = function(place, callback_media) {
  Instagram.locations.recent({ 
    location_id: place[0].id,
    complete: function(data, pagination){
      return callback_media(null, pagination);
    }, 
    // error: function(errorMessage, errorObject, caller) {
    //   console.log(errorMessage);
    //   return callback_media(errorObject, null);
    // }
  });
}

/*
* Get info for a vanue. Info consists of Yelp and Foursquare
* data. We need this for getting the ratings of the place.
*/
var get_venue_info = function(venue, callback_info) {
  foursquare.venues.venue(venue.id, {}, function(err, data) {
    if (! err) {
      var lat = venue.location.lat;
      var lng = venue.location.lng;
      yelp.search({
                   ll: lat + "," + lng, 
                   term: venue.name,
                   limit: 1
                 }, function(error, ydata) {
        if (! error && ydata) { 
          var ret_data = {fq: data.response.venue, yelp: ydata};
          return callback_info(null, ret_data)
        } else {
          return callback_info(null, {fq: data.response.venue})
        }
      });
    } else return callback_info(err, null)

  })
}

/*
* Get all the photos with their info of NYC. 
* 
*/
app.get('/api/get_nyc_photos', function(req, res, next) {
  foursquare.venues.search({
    near: 'New York City, NY',
    categoryId: '4bf58dd8d48988d1e0931735',
    limit: 50,
  }, function(err, data) {
    if (! err) {
      var venues = data.response.venues;
      async.map(venues, get_instagram_loc_id, function(error, places){
        if (! error  && places) {
          // at this point we have bunch of instagram coffee shops (places).
          async.map(places, get_media, function(err_pics, pics){
            if (! err_pics && pics) {
              async.map(venues, get_venue_info, function(err_venues, info){
                if (! err_venues && info) {
                  res.send({'pics':pics, 'venues':info});
                } else next();
              });
            } else next();
          });
        } else next();
      });

    } else next();
  })
});


/*
* Get all the photos with their info of SF. 
* 
*/
app.get('/api/get_sf_photos', function(req, res, next) {
  foursquare.venues.search({
    near: 'San Francisco, CA',
    categoryId: '4bf58dd8d48988d1e0931735',
    limit: 50,
  }, function(err, data) {
    if (! err) {
      var venues = data.response.venues;
      async.map(venues, get_instagram_loc_id, function(err, places){
        if (! err  && places) {
          // at this point we have bunch of instagram coffee shops (places).
          async.map(places, get_media, function(err, pics){
            if (! err && pics) {
              async.map(venues, get_venue_info, function(err, info){
                if (! err && info) {
                  res.send({'pics':pics, 'venues':info});
                }
              });
            }
          });
        }
      });

    } else next();
  })
});

// middleware with an arity of 4 are considered
// error handling middleware. When you next(err)
// it will be passed through the defined middleware
// in order, but ONLY those with an arity of 4, ignoring
// regular middleware.
app.use(function(err, req, res, next){
  // whatever you want here, feel free to populate
  // properties on `err` to treat it differently in here.
  res.status(err.status || 500);
  res.send({ error: err.message });
});

// our custom JSON 404 middleware. Since it's placed last
// it will be the last middleware called, if all others
// invoke next() and do not respond.
app.use(function(req, res){
  res.status(404);
  res.send({ error: "Lame, can't find that" });
});

/* istanbul ignore next */
if (!module.parent) {
  var port = process.env.PORT || 3000
  app.listen(port);
  console.log('Express started on port ' + port);
}