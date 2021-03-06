package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
)

type PipelineMessage struct {
	Account             string `json:"account"`
	DetailType          string `json:"detailType"`
	Region              string `json:"region"`
	Source              string `json:"source"`
	Time                string `json:"time"`
	NotificationRuleArn string `json:"notificationRuleArn"`
	Detail              struct {
		Pipeline         string `json:"pipeline"`
		ExecutionId      string `json:"execution-id"`
		ExecutionTrigger struct {
			TriggerType   string `json:"trigger-type"`
			TriggerDetail string `json:"trigger-detail"`
		} `json:"execution-trigger"`
		State   string  `json:"state"`
		Version float64 `json:"version"`
	} `json:"detail"`
}

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

func pipelineMessageState(event SNSRecords) (state string) {
	msg := PipelineMessage{}
	err := json.Unmarshal([]byte(event.Records[0].Sns.Message), &msg)
	if err == nil {
		state = msg.Detail.State
	} else {
		log.Println(err)
		state = "UNKNOWN"
	}
	log.Println("Pipeline state:", state)
	return state
}

func HandleRequest(ctx context.Context, event SNSRecords) (string, error) {
	log.Println(event)
	if len(event.Records) == 0 || pipelineMessageState(event) != "SUCCEEDED" {
		log.Println("No pipeline message or pipeline state is not SUCCEEDED, skipping")
		return "SKIP", nil
	}
	log.Println(event.Records[0].Sns.Message)
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
