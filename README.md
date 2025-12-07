# Kube Admin Dashboard

Kubernetes dashboard for admin users. This dashboard is designed to be used by cluster administrators to manage the cluster.

## Features and Capabilities

**Cluster Overview:** View real-time metrics and status of the cluster, including nodes, pods, and services.

**Import Applications:** Import and deploy applications to the cluster with ease. Use yaml files or directly deploy container images.

**Resource Viewer:** Manage and monitor Kubernetes resources such as deployments, services, and persistent volumes.

**Chart Viewer:** View and delete Helm charts installed in the cluster.

**Virtual Services:** List, add and delete virtual services which expose services externally through given hostname.

**Data Browser:** List and browse S3 or file shares in the cluster. Files can be viewed as text, or videos and images are displayed in the browser. 

**Logging and Monitoring:** Basic monitoring tools to gain insights into cluster performance and health. Run [PromQL queries](https://promlabs.com/promql-cheat-sheet/) for in-depth view.

## Usage

The Kube Admin Dashboard provides a web-based interface for interacting with your Kubernetes cluster. Once deployed, you can access it through the Apps & Frameworks tile.

Use the sidebar to select sections and follow UI guidance.

### Instructions to Deploy Helm Chart Using PCAI Import Framework

To deploy the Kube Admin Dashboard using the PCAI Import Framework, follow these steps:

Download the [helm chart](./kubik-1.0.0.tgz) and [app logo](./helm/logo.png).

Open PCAI Import Framework tool: Provide a name, description and upload the logo.
Upload the helm chart in the next section and provide namespace. **Tip**: Use a project or user namespace to mount access-token, required for S3 Browser.

Configure Values: Customize the values.yaml file to match your deployment requirements.

Access the Dashboard: Once the deployment is complete, access the dashboard through the provided URL or via the Kubernetes dashboard proxy.

# Contact

This is not a supported tool, careful with using it in production. 
