package main

import (
	"bytes"
	"context"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
)

type SNSEvent struct {
	EventSource          string `json:"EventSource"`
	EventVersion         string `json:"EventVersion"`
	EventSubscriptionArn string `json:"EventSubscriptionArn"`
	Sns                  struct {
		Type              string `json:"Type"`
		MessageID         string `json:"MessageId"`
		TopicArn          string `json:"TopicArn"`
		Subject           string `json:"Subject"`
		Message           string `json:"Message"`
		Timestamp         string `json:"Timestamp"`
		SignatureVersion  string `json:"SignatureVersion"`
		Signature         string `json:"Signature"`
		SigningCertURL    string `json:"SigningCertURL"`
		UnsubscribeURL    string `json:"UnsubscribeURL"`
		MessageAttributes struct {
		} `json:"MessageAttributes"`
	}
}

type SNSRecords struct {
	Records []SNSEvent `json:"Records"`
}

func doHTTPPostRequest(url string, body []byte) ([]byte, error) {
	log.Println("post request", string(body), " to url:", url)
	req, err := http.NewRequestWithContext(context.TODO(), "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("PAT"))
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyRes, err := ioutil.ReadAll(resp.Body)

	return bodyRes, err
}

func HandleRequest(ctx context.Context, event SNSRecords) (string, error) {
	log.Println(event)
	resp, err := doHTTPPostRequest(
		os.Getenv("DISPATCH_URL"),
		[]byte(`{"event_type":"e2e"}`),
	)
	if err != nil {
		log.Fatalln(err)
	}
	log.Println(string(resp))
	return "OK", nil
}

func main() {
	lambda.Start(HandleRequest)
}
