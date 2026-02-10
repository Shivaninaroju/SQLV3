
import os
import time
from google.oauth2 import service_account
from googleapiclient import discovery

# Path to your service account key file
KEY_FILE = 'GoogleKey.json'

def enable_api():
    print(f"Reading credentials from {KEY_FILE}...")
    if not os.path.exists(KEY_FILE):
        print(f"Error: {KEY_FILE} not found!")
        return

    # Load credentials
    credentials = service_account.Credentials.from_service_account_file(
        KEY_FILE,
        scopes=['https://www.googleapis.com/auth/cloud-platform']
    )
    
    project_id = credentials.project_id
    service_name = 'projects/' + project_id + '/services/aiplatform.googleapis.com'
    
    print(f"Project ID: {project_id}")
    print("Attempting to enable aiplatform.googleapis.com (Vertex AI)...")
    
    try:
        # Build the Service Usage API client
        service = discovery.build('serviceusage', 'v1', credentials=credentials)
        
        print("Sending request to enable aiplatform.googleapis.com...")

        # Enable the service
        # The correct path for v1 is service.services().enable()
        operation = service.services().enable(name=service_name).execute()
        
        print("Enabling in progress (Operation ID: " + operation.get('name', 'unknown') + ")...")
        
        # Wait for the operation to complete
        while not operation.get('done'):
            print("Waiting for activation...")
            time.sleep(5)
            operation = service.operations().get(name=operation['name']).execute()
            
        print("DONE: Vertex AI API has been successfully enabled via CLI!")
        
    except Exception as e:
        print(f"FAILED: Failed to enable API via script: {e}")
        print("\nNote: The service account might lack 'serviceusage.services.enable' permission.")
        print("If this fails, you must enable it manually in the console at:")
        print(f"https://console.developers.google.com/apis/api/aiplatform.googleapis.com/overview?project={project_id}")

if __name__ == "__main__":
    enable_api()
