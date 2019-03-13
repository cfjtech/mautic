<?php

// If necessary, modify the path in the require statement below to refer to the 
// location of your Composer autoload.php file.
require 'vendor/autoload.php';

define( 'AWSSESEndpoint', 'https://email.us-east-1.amazonaws.com/' );

$filename = $argv[1];
$payload = file_get_contents ( $filename );
$message = unserialize($payload);

//Create the Transport
$transport = Swift_AWSTransport::newInstance($_ENV['AWS_ACCESSKEY'], $_ENV['AWS_SECRETKEY']);
$transport->setEndpoint( AWSSESEndpoint );

//Create the Mailer using your created Transport
$mailer = new Swift_Mailer($transport);

try {
    rename($filename, $filename.'.sending');
    if ($mailer->send($message)) {
        unlink($filename.'.sending');
    } else {
        rename($filename.'.sending', $filename);
    }
}
catch( AWSEmptyResponseException $e ) {
    echo $e . "\n";
}

?>
