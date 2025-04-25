import React, { useState, useRef } from 'react';
import { FaMicrophone, FaDownload, FaUpload } from 'react-icons/fa';
import Comput3API from '../services/comput3Api';
import StoredApiKey from './StoredApiKey';

// Proxy URL for development
const PROXY_URL = 'http://localhost:8080/';

// Fallback node to use if we can't get instance info
const FALLBACK_NODE = "widely-gladly-choice-gpu.comput3.ai";

const WhisperTranscriber = () => {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState('medium');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  const models = [
    { id: 'tiny', name: 'Tiny (Fast)' },
    { id: 'base', name: 'Base' },
    { id: 'small', name: 'Small' },
    { id: 'medium', name: 'Medium (Recommended)' },
    { id: 'large', name: 'Large (Most Accurate)' }
  ];

  const handleApiKeyChange = (key) => {
    setApiKey(key);
  };

  // Close event source if exists
  const closeEventSource = () => {
    if (eventSourceRef.current) {
      console.log('Closing event source');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an audio file to transcribe');
      return;
    }

    if (!apiKey) {
      setError('Please enter your API key');
      return;
    }

    setIsTranscribing(true);
    setError(null);
    setProgress(10);
    setTranscriptText('');
    closeEventSource();

    try {
      // Step 1: Get node information
      let node;
      
      try {
        // Try to get media instance
        const api = new Comput3API(apiKey);
        const mediaInstance = await api.getMediaInstance();

        if (!mediaInstance) {
          console.warn('No media instance available, falling back to default node');
          node = FALLBACK_NODE;
        } else {
          node = mediaInstance.node;
        }
      } catch (err) {
        console.error('Error getting media instance:', err);
        console.warn('Falling back to default node');
        node = FALLBACK_NODE;
      }
      
      console.log(`Using node: ${node}`);
      
      // Create the UI URL for the whisper endpoint
      const baseUrl = `${PROXY_URL}https://ui-${node}/whisper`;
      console.log(`Using base URL: ${baseUrl}`);
      
      // Generate a unique session hash
      const sessionHash = `s${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;
      console.log(`Session hash: ${sessionHash}`);
      
      // Step 2: Upload the audio file
      console.log('Uploading audio file...');
      setProgress(20);
      
      // Create a unique upload ID
      const uploadId = Math.random().toString(36).substring(2, 15);
      
      // Create form data for file upload
      const formData = new FormData();
      formData.append('files', file);
      
      // Upload the file
      const uploadResponse = await fetch(`${baseUrl}/gradio_api/upload?upload_id=${uploadId}`, {
        method: 'POST',
        headers: {
          'X-C3-API-KEY': apiKey
        },
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.status}`);
      }
      
      const uploadResult = await uploadResponse.json();
      console.log('Upload result:', uploadResult);
      
      if (!uploadResult || !Array.isArray(uploadResult) || uploadResult.length === 0) {
        throw new Error('Invalid upload response');
      }
      
      // Handle two possible formats: array of strings or array of objects with path property
      const filePath = typeof uploadResult[0] === 'string' ? uploadResult[0] : uploadResult[0].path;
      if (!filePath) {
        throw new Error('No file path found in upload response');
      }
      
      const fileUrl = `${baseUrl}/gradio_api/file=${encodeURIComponent(filePath)}`;
      console.log(`File uploaded to: ${filePath}`);
      console.log(`File URL: ${fileUrl}`);
      
      setProgress(40);
      
      // Step 3: Submit the transcription job
      console.log('Submitting transcription job...');
      
      // Prepare the data payload for transcription
      const transcriptionData = {
        data: [
          {
            path: filePath,
            url: fileUrl,
            orig_name: file.name,
            size: file.size,
            mime_type: file.type,
            meta: {
              _type: "gradio.FileData"
            }
          },
          model,            // Selected model
          "transcribe",     // Task type (transcribe or translate)
          "",               // Language (empty for auto-detect)
          "cuda",           // Device
          "float16",        // Compute type
          16,               // Batch size
          "",               // Prompt
          false,            // No timestamps
          "nearest",        // Align mode
          false,            // Single speaker
          "pyannote",       // VAD method
          0.5,              // VAD threshold
          0.363,            // VAD min silence
          30,               // VAD speech pad ms
          false,            // Detect disfluencies
          "",               // Compile keyword
          "",               // Inverse compile keyword
          0,                // Temperature
          5,                // Temperature increment
          5,                // Compression ratio threshold
          1,                // Logprob threshold
          1,                // No speech threshold
          "-1",             // Condition on previous
          false,            // Hallucination silence
          true,             // Word timestamps
          "",               // Initial prompt
          true,             // Word level timestamps
          false,            // Use faster whisper
          "",               // Prefix 
          "",               // Suffix
          "sentence",       // Segment resolution
          1,                // Min segment length
          2.4,              // Segment padding
          -1,               // Max segment length
          0.6,              // Clip timestamps
          ""                // Second audio file (not used)
        ],
        event_data: null,
        fn_index: 0,
        trigger_id: Math.floor(Math.random() * 100),
        session_hash: sessionHash
      };
      
      const queueResponse = await fetch(`${baseUrl}/gradio_api/queue/join?`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-C3-API-KEY': apiKey
        },
        body: JSON.stringify(transcriptionData)
      });
      
      if (!queueResponse.ok) {
        const errorText = await queueResponse.text();
        throw new Error(`Failed to submit job: ${queueResponse.status} - ${errorText}`);
      }
      
      const queueData = await queueResponse.json();
      console.log('Job submitted:', queueData);
      
      if (!queueData.event_id) {
        throw new Error('No event ID returned from server');
      }
      
      const eventId = queueData.event_id;
      console.log(`Got event ID: ${eventId}`);
      
      setProgress(50);
      
      // Step 4: Poll for status and results
      console.log('Starting to listen for events...');
      
      // Create stream URL
      const streamUrl = `${baseUrl}/gradio_api/queue/data?session_hash=${sessionHash}`;
      console.log(`Stream URL: ${streamUrl}`);
      
      // Return a promise that resolves when processing is complete
      return new Promise((resolve, reject) => {
        // For SSE we need to create a custom polling implementation
        // since we need to add custom headers for authentication
        const streamController = new AbortController();
        const signal = streamController.signal;
        
        // Function to poll for event data as a replacement for EventSource
        const pollForEvents = async () => {
          try {
            const response = await fetch(streamUrl, {
              headers: {
                'Accept': 'text/event-stream',
                'X-C3-API-KEY': apiKey,
                'X-Requested-With': 'XMLHttpRequest'
              },
              signal: signal
            });
            
            if (!response.ok) {
              throw new Error(`Stream error: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              
              // Process complete event messages
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || ''; // Keep last incomplete chunk in buffer
              
              for (const line of lines) {
                if (line.trim() && line.startsWith('data: ')) {
                  const eventData = line.substring(6); // Remove "data: " prefix
                  handleEventData(eventData);
                }
              }
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('Polling error:', err);
              
              // Try to recover if connection is lost
              setTimeout(() => {
                pollForEvents();
              }, 2000);
            }
          }
        };
        
        // Start polling
        pollForEvents();
        
        // Store the controller for cleanup
        eventSourceRef.current = {
          close: () => {
            streamController.abort();
          }
        };
        
        // Process event data (similar to onmessage handler)
        const handleEventData = (eventText) => {
          try {
            const data = JSON.parse(eventText);
            console.log('Event received:', data);
            
            // Handle different message types
            switch (data.msg) {
              case 'estimation':
                console.log(`In queue: position ${data.rank} of ${data.queue_size}`);
                setProgress(55);
                break;
                
              case 'process_starts':
                console.log('Processing started');
                setProgress(60);
                break;
                
              case 'process_generating':
                // Increment progress during generation
                setProgress(prev => Math.min(85, prev + 3));
                break;
                
              case 'heartbeat':
                // Increment progress slightly on each heartbeat
                setProgress(prev => Math.min(85, prev + 1));
                break;
                
              case 'process_completed':
                console.log('Processing completed!', data);
                if (data.output && data.output.data && data.output.data[0]) {
                  const transcriptResult = data.output.data[0];
                  setTranscriptText(transcriptResult);
                  setProgress(100);
                  resolve(transcriptResult);
                } else {
                  reject(new Error('No transcript data in response'));
                }
                break;
                
              case 'close_stream':
                console.log('Stream closed by server');
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                }
                break;
            }
          } catch (err) {
            console.error('Error processing event data:', err);
          }
        };
      });
    } catch (err) {
      console.error('Error transcribing audio:', err);
      setError(err.message);
      setProgress(0);
      closeEventSource();
    } finally {
      setIsTranscribing(false);
    }
  };

  // Clean up event source on unmount
  React.useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, []);

  const handleDownload = () => {
    if (transcriptText) {
      const blob = new Blob([transcriptText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="text-center mb-8 pb-5 border-b border-gray-200">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Whisper Speech-to-Text</h1>
        <p className="text-gray-600 text-lg">Convert your audio to text using Whisper</p>
      </div>

      <StoredApiKey onChange={handleApiKeyChange} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
            Audio File
          </label>
          <div className="flex items-center">
            <input
              type="file"
              id="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*"
              className="hidden"
              disabled={isTranscribing}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              disabled={isTranscribing}
            >
              <FaUpload className="mr-2" />
              {file ? 'Change File' : 'Select Audio File'}
            </button>
            {file && (
              <span className="ml-3 text-sm text-gray-500">
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
            Model Size
          </label>
          <select
            id="model"
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isTranscribing}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Larger models are more accurate but take longer to process
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md">
            <p>{error}</p>
          </div>
        )}

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isTranscribing || !file || !apiKey}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            <FaMicrophone className="mr-2" />
            {isTranscribing ? 'Transcribing...' : 'Transcribe Audio'}
          </button>
        </div>
      </form>

      {isTranscribing && (
        <div className="mt-6">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-center text-sm text-gray-500 mt-2">
            {progress < 40 ? 'Uploading audio file...' : 
             progress < 60 ? 'Preparing transcription...' : 
             progress < 100 ? 'Transcribing audio...' : 'Transcription complete!'}
          </p>
        </div>
      )}

      {transcriptText && (
        <div className="mt-6 space-y-4">
          <div className="p-4 bg-gray-50 rounded-md border border-gray-200">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Transcript</h3>
            <div className="max-h-60 overflow-y-auto p-2 bg-white rounded border border-gray-200">
              <p className="whitespace-pre-wrap">{transcriptText}</p>
            </div>
          </div>
          <div className="flex justify-center">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center"
            >
              <FaDownload className="mr-2" />
              Download Transcript
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhisperTranscriber; 