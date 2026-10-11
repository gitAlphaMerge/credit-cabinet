package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"time"
)

type ProxyHandler struct {
	mlURL      string
	httpClient *http.Client
}

func NewProxyHandler() *ProxyHandler {
	mlURL := os.Getenv("ML_URL")
	if mlURL == "" {
		mlURL = "http://ml-model:5000"
	}

	return &ProxyHandler{
		mlURL: mlURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (h *ProxyHandler) HandleScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	targetURL := h.mlURL + "/score"

	proxyReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, r.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to construct upstream request"}`, http.StatusInternalServerError)
		return
	}

	if ct := r.Header.Get("Content-Type"); ct != "" {
		proxyReq.Header.Set("Content-Type", ct)
	}

	resp, err := h.httpClient.Do(proxyReq)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)

		if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
			w.Write([]byte(`{"error":"bad_gateway","detail":"ml-model upstream timed out"}`))
			return
		}

		w.Write([]byte(`{"error":"bad_gateway","detail":"ml-model upstream is unavailable or offline"}`))
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
