/*
Aneeq Shah
Cs-355-Assignment-3
Music Artist Search
*/

//All the required libraries needed for the app.
const http = require('http');
const fs = require('fs');
const https = require('https');
const url = require('url');
const querystring = require('querystring');

const server_address = 'localhost';
const port = 3000;

//Reading in the html file.
let html_stream = fs.createReadStream('./html/search-form.html','utf8');

//Reading in the credentials file. where the api credentials are stored.
const credentials_json = fs.readFileSync('./auth/credentials.json', 'utf8');
const credentials = JSON.parse(credentials_json);

//Saving the credentials into a variable.
let post_data = querystring.stringify({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    grant_type: "client_credentials"
});

//Creating the options required for the POST request.
const options = {
    'method' : 'POST',
    'headers' : {
        'Content-type' : 'application/x-www-form-urlencoded',
        'Content-length': post_data.length
    }
};

//Variable to cache the access token.
const authentication_cache = './auth/authentication_res.json';

//Creating a server to get the requests and the responses from the site.
let server = http.createServer((req,res)=>{
	console.log(`A new request was made from ${req.connection.remoteAddress} for ${req.url}`);

	//Parsing the input the user types in the search bar.
    const user_input = url.parse(req.url, true);

    //If users on home page, this request is made.
    if(req.url === '/'){
        console.log('request was made: /');
        res.writeHead(200,{'Content-Type':'text/html'});
        html_stream.pipe(res);

        //If users on favicon.ico page, this request is made.
    }else if(req.url.includes('/favicon.ico')){
        //Sends user an error when they reach this page.
        console.log('request was made: /favicon.ico');
        res.writeHead(404);
        res.end();

        //If users on artists/ page, this request is made.
    }else if(req.url.includes('/artists/')){
        console.log('request was made: /artists/');
        res.writeHead(200,{'Content-Type':'image/jpeg'});

        //If image exists, shows it to user.
        let image_stream = fs.createReadStream('./artists/' + req.url.substring(9, req.url.length));
        image_stream.pipe(res);
        console.log('Done');

        //If image doesn't exist then gives the user an error
		image_stream.on('error', function (err) {
			console.log(err);
			res.writeHead(404);
			return res.end();
        });

        //If users on search page, this request is made.
    }else if(req.url.includes('/search')){
        console.log('request was made: /search');
        console.log('request was made: ' + user_input.path);
        console.log(user_input.query);

        //Checking if token expired.
        let cache_valid = false;
        let content = fs.readFileSync(authentication_cache, 'utf-8');
        let cached_auth = JSON.parse(content);
        if(fs.existsSync(authentication_cache)){
            if(new Date(cached_auth.expiration) > Date.now()){
                cache_valid = true;
            }
            else{
                console.log("Token Expired");
            }
        }

        //If token is not expired, make a search request.
        if(cache_valid){
            create_search_req(cached_auth, res, user_input);
        }

        //Requesting a token, if previous token expired.
        else{
            const authentication_req_url = 'https://accounts.spotify.com/api/token';
            let request_sent_time = new Date();
            let authentication_req = https.request(authentication_req_url, options, authentication_res => {
                received_authentication(authentication_res, res, user_input, request_sent_time);
            });
            authentication_req.on('error', (e) => {
                console.error(e);
            });
            authentication_req.write(post_data);
            console.log("Requesting Token");
            authentication_req.end();
        }
    }
});

//Function to receive a token.
function received_authentication(authentication_res, res, user_input, request_sent_time) {
    authentication_res.setEncoding("utf8");
    let body = "";
    authentication_res.on("data", data => {body += data;});
    authentication_res.on("end", () =>{
        let authentication_res_data = JSON.parse(body);
        authentication_res_data.expiration = new Date(request_sent_time.getTime() + 3600).toLocaleTimeString('en-Us');
        create_cache(authentication_res_data);
        create_search_req(authentication_res_data,res,user_input, request_sent_time);
    });
}

//Function to cache the token and save it into a new file.
function create_cache(authentication_res_data){
    let authentication_cache = JSON.stringify(authentication_res_data);
    //Writing data to the file.
    fs.writeFile('./auth/authentication_res.json', authentication_cache, function (e) {
        if(e) throw e;
        console.log('Saved to File');
    });
}


//Function to make a new serch request to the Spotify api.
function create_search_req(authentication_res_data,res, user_input) {
    //Api url
    const url = 'https://api.spotify.com/v1/search?';

    //Required parameters needed for the request.
    const query = querystring.stringify({
        q: user_input.query.artist,
        type: 'artist',
        access_token: authentication_res_data.access_token
    }, '&');

    let body="";
    let search_req = https.request(url + query, search_res => {
        search_res.on("data", data => {body += data;});
        search_res.on("end", () =>{

            let search_res_data = JSON.parse(body);

            console.log(url + query);
            console.log(search_res_data.artists.items[0].genres);
            console.log(search_res_data.artists.items[0].images[0].url);
            console.log(search_res_data.artists.items[0].name);

            download_image(search_res_data, res);
        });
    });

    search_req.on('error', (e) => {
        console.error(e);
    });

    search_req.end();

}

//Function to save and cache images.
function download_image(search_res_data, res){
    //Variable to hold the image name.
    let imag_name = search_res_data.artists.items[0].name;
    imag_name = imag_name.replace(/\s+/g, '');

    //Variable to hold the image path.
    const img_path = './artists/' + imag_name + '.jpg';

    //Variable to hold the url to the image.
    const img_url = search_res_data.artists.items[0].images[0].url;

    //The html data to show the user.
    let webpage = `<h1 style="text-align:center;">Name: ${search_res_data.artists.items[0].name}</h1><p style="text-align:center;">Genres: ${search_res_data.artists.items[0].genres.join()}</p><img src = "./artists/${imag_name}.jpg"/>`;

    //Check to see if image is downloaded already.
    if(fs.existsSync(img_path)){
        res.end(webpage);
    }

    //If image doesn't exist, then download the image required for the artist.
    else {
        let img_req = https.get(img_url, image_res => {
            let new_img = fs.createWriteStream(img_path, {'encoding': null});
            image_res.pipe(new_img);
            new_img.on('finish', function () {
                console.log('Download Finised');
                res.end(webpage);
            });
        });

        img_req.on('error', (e) => {
            console.error(e);
        });

        img_req.end();
    }
}

console.log('Now listening on port ' + port);
server.listen(port,server_address);




