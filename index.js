/**
 * Module dependencies.
 */

var express = require('express');
Instagram = require('instagram-node-lib');
var bodyParser = require('body-parser');
var request = require("request");
async = require("async")

Instagram.set('client_id', 'bc79f78daa3b4276894bfb0555ecd491');
Instagram.set('client_secret', '2cf97c4759124e57b34e75a28f9ceb1d');

var foursquare = require('node-foursquare-venues')
                ('GNX5TWTVWKK04UQSGDG1TNNPUZIBVYRPRSYWHW5SB5WGSEBJ', 
                 'YPPTJP2Z2FFI021EZXA0EJN2UNYFPEEREVULTBVHFYRWUQTD')

var app = module.exports = express();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())




// create an error with .status. we
// can then use the property in our
// custom error handler (Connect repects this prop as well)

function error(status, msg) {
  var err = new Error(msg);
  err.status = status;
  return err;
}

// if we wanted to supply more than JSON, we could
// use something similar to the content-negotiation
// example.

// here we validate the API key,
// by mounting this middleware to /api
// meaning only paths prefixed with "/api"
// will cause this middleware to be invoked

app.use('/api', function(req, res, next){
  var key = 'foo'; // req.query['api-key'];

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

var apiKeys = ['foo', 'bar', 'baz'];


// we now can assume the api key is valid,
// and simply expose the data

app.get('/api', function(req, res, next){
  res.send('Hello this is the coffee API speaking now!');
});

var calc = function(num, callback) {
  return callback(null, num * num);
}

// try to match the foursquare place to a instragram place.
var get_instagram_loc_id = function(venue, callback) {
  //console.log(venue);
  
  Instagram.locations.search({ 

    foursquare_v2_id: venue.id,
    complete: function(data){
      return callback(null, data);
    }, 
    error: function(errorMessage, errorObject, caller) {
      console.log(errorMessage);
      return callback(errorObject, null);
        // errorMessage is the raised error message
        // errorObject is either the object that caused the issue, or the nearest neighbor
        // caller is the method in which the error occurred
    }
  });
}

var get_media = function(place, callback_media) {


  Instagram.locations.recent({ 

    location_id: place[0].id,
    complete: function(data, pagination){
      console.log(data);
      console.log("*****************************************************************");
      // we should return pagination instead so the result set is smaller.
      return callback_media(null, data);
    }, 
    error: function(errorMessage, errorObject, caller) {
      console.log(errorMessage);
      return callback_media(errorObject, null);
        // errorMessage is the raised error message
        // errorObject is either the object that caused the issue, or the nearest neighbor
        // caller is the method in which the error occurred
    }
  });
}



app.get('/api/get_nyc_photos', function(req, res, next) {
  
  foursquare.venues.search({
    near: 'New York City, NY',
    categoryId: '4bf58dd8d48988d1e0931735',
    limit: 100,
  }, function(err, data) {

    if (! err) {
      var venues = data.response.venues;

      async.map(venues, get_instagram_loc_id, function(err, places){
        if (! err  && places) {
          // res.send(places);
          // at this point we have bunch of instagram coffee shops (places).
          async.map(places, get_media, function(err, pics){
            if (! err && pics) {

              // at this point we have an array of pics
              res.send(pics);
            }
          });
        }
      });

    } else next();

  })

});

app.get('/api', function(req, res, next){
  res.send('Hello this is the coffee API speaking now!');
});

app.get('/api/get_sf_photos', function(req, res, next) {

  foursquare.venues.search({
    near: 'San Francisco, CA',
    categoryId: '4bf58dd8d48988d1e0931735'
  }, function(err, data) {

    if (! err) {
      var venues = data.response.venues;
      res.status(200).send(venues);
      // var venues = body.response.venues;
      // res.status(200).send(venues);

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
  app.listen(3001);
  console.log('Express started on port 3001');
}