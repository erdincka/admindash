
import { monitoringApi, PromResult } from '@/lib/api/monitoring';
import { notify } from '@/lib/utils/notifications';
import { Box, Button, Card, CardBody, CardHeader, DataChart, DataTable, Heading, Select, Tab, Tabs, Text, TextArea, Spinner } from 'grommet';
import { Search, Refresh } from 'grommet-icons';
import { useEffect, useState } from 'react';

export const Monitoring = () => {
    const [activeTab, setActiveTab] = useState(0);

    return (
        <Box pad="large" gap="medium" animation="fadeIn" fill>
            <Box direction="row" justify="between" align="center">
                <Box>
                    <Heading level="2" margin="none">Monitoring</Heading>
                    <Text color="text-weak">Cluster metrics and resource usage.</Text>
                </Box>
            </Box>

            <Tabs activeIndex={activeTab} onActive={setActiveTab}>
                <Tab title="Cluster Overview">
                    <OverviewTab />
                </Tab>
                <Tab title="Resources">
                    <ResourcesTab />
                </Tab>
                <Tab title="Custom Query">
                    <CustomQueryTab />
                </Tab>
            </Tabs>
        </Box>
    );
};

const OverviewTab = () => {
    const [loading, setLoading] = useState(false);
    const [cpuData, setCpuData] = useState<any[]>([]);
    const [memData, setMemData] = useState<any[]>([]);

    // Queries
    // Use range queries for charts
    const range = '1h'; // last 1 hour

    const fetchData = async () => {
        setLoading(true);
        const end = new Date();
        const start = new Date(end.getTime() - 60 * 60 * 1000); // 1 hour ago
        const step = '60s';

        try {
            // Cluster CPU
            const cpuRes = await monitoringApi.queryRange(
                'sum(rate(container_cpu_usage_seconds_total{image!=""}[5m]))',
                start.toISOString(),
                end.toISOString(),
                step
            );
            if (cpuRes.data?.result?.[0]?.values) {
                setCpuData(cpuRes.data.result[0].values.map((v: any) => ({
                    time: new Date(v[0] * 1000).toLocaleTimeString(),
                    value: parseFloat(v[1])
                })));
            }

            // Cluster Memory
            const memRes = await monitoringApi.queryRange(
                'sum(container_memory_working_set_bytes{image!=""})',
                start.toISOString(),
                end.toISOString(),
                step
            );
            if (memRes.data?.result?.[0]?.values) {
                setMemData(memRes.data.result[0].values.map((v: any) => ({
                    time: new Date(v[0] * 1000).toLocaleTimeString(),
                    value: parseFloat(v[1]) / (1024 * 1024 * 1024) // GB
                })));
            }
        } catch (e: any) {
            notify.critical(`Failed to fetch overview metrics: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    return (
        <Box pad={{ top: 'medium' }} gap="medium">
            <Box direction="row" justify="end">
                <Button icon={<Refresh />} onClick={fetchData} tip="Refresh" plain />
            </Box>
            <Box direction="row" gap="medium" wrap>
                <Card width="medium" background="light-1">
                    <CardHeader pad="medium">
                        <Heading level="4" margin="none">Total CPU Output (Cores)</Heading>
                    </CardHeader>
                    <CardBody pad="medium" height="small">
                        {loading && cpuData.length === 0 ? <Spinner /> : (
                            <DataChart
                                data={cpuData}
                                series={['time', { property: 'value', label: 'Cores' }]}
                                chart={[{ property: 'value', type: 'line', thickness: 'hair', color: 'brand' }]}
                                axis={{ x: { property: 'time', granularity: 'medium' }, y: { property: 'value', granularity: 'medium' } }}
                                guide={{ y: { granularity: 'medium' } }}
                                size={{ width: 'full', height: 'small' }}
                                detail
                            />
                        )}
                        {cpuData.length > 0 && <Text size="xlarge" weight="bold">{cpuData[cpuData.length - 1].value.toFixed(2)}</Text>}
                    </CardBody>
                </Card>

                <Card width="medium" background="light-1">
                    <CardHeader pad="medium">
                        <Heading level="4" margin="none">Total Memory Usage (GB)</Heading>
                    </CardHeader>
                    <CardBody pad="medium" height="small">
                        {loading && memData.length === 0 ? <Spinner /> : (
                            <DataChart
                                data={memData}
                                series={['time', { property: 'value', label: 'GB' }]}
                                chart={[{ property: 'value', type: 'area', thickness: 'hair', color: 'accent-2', opacity: 'medium' }]}
                                axis={{ x: { property: 'time', granularity: 'medium' }, y: { property: 'value', granularity: 'medium' } }}
                                guide={{ y: { granularity: 'medium' } }}
                                size={{ width: 'full', height: 'small' }}
                                detail
                            />
                        )}
                        {memData.length > 0 && <Text size="xlarge" weight="bold">{memData[memData.length - 1].value.toFixed(2)} GB</Text>}
                    </CardBody>
                </Card>
            </Box>
        </Box>
    );
};

const ResourcesTab = () => {
    const [topCpu, setTopCpu] = useState<any[]>([]);
    const [topMem, setTopMem] = useState<any[]>([]);
    const [namespaceUsage, setNamespaceUsage] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Top 10 Pods CPU
            const topCpuRes = await monitoringApi.query('topk(10, sum(rate(container_cpu_usage_seconds_total{image!=""}[5m])) by (pod, namespace))');
            if (topCpuRes.data?.result) {
                setTopCpu(topCpuRes.data.result.map(r => ({
                    pod: r.metric.pod,
                    namespace: r.metric.namespace,
                    value: parseFloat(r.value?.[1] || '0')
                })).sort((a, b) => b.value - a.value));
            }

            // Top 10 Pods Memory
            const topMemRes = await monitoringApi.query('topk(10, sum(container_memory_working_set_bytes{image!=""}) by (pod, namespace))');
            if (topMemRes.data?.result) {
                setTopMem(topMemRes.data.result.map(r => ({
                    pod: r.metric.pod,
                    namespace: r.metric.namespace,
                    value: parseFloat(r.value?.[1] || '0') / (1024 * 1024) // MB
                })).sort((a, b) => b.value - a.value));
            }

            // Namespace Breakdown (CPU)
            const nsRes = await monitoringApi.query('sum(rate(container_cpu_usage_seconds_total{image!=""}[5m])) by (namespace)');
            if (nsRes.data?.result) {
                setNamespaceUsage(nsRes.data.result.map(r => ({
                    namespace: r.metric.namespace,
                    value: parseFloat(r.value?.[1] || '0')
                })).sort((a, b) => b.value - a.value));
            }

        } catch (e: any) {
            notify.critical(`Failed to fetch resource metrics: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Box pad={{ top: 'medium' }} gap="large">
            <Box direction="row" justify="end">
                <Button icon={<Refresh />} onClick={fetchData} tip="Refresh" plain />
            </Box>

            <Box direction="row" gap="medium">
                <Box width="1/2">
                    <Heading level="4">Top Pods by CPU (Cores)</Heading>
                    <DataTable
                        data={topCpu}
                        columns={[
                            { property: 'pod', header: 'Pod', size: 'medium' },
                            { property: 'namespace', header: 'Namespace', size: 'small' },
                            { property: 'value', header: 'Cores', render: d => d.value.toFixed(3), align: 'end' }
                        ]}
                        sort={{ property: 'value', direction: 'desc' }}
                        sortable
                        paginate
                        step={5}
                        border='horizontal'
                    />
                </Box>
                <Box width="1/2">
                    <Heading level="4">Top Pods by Memory (MB)</Heading>
                    <DataTable
                        data={topMem}
                        columns={[
                            { property: 'pod', header: 'Pod', size: 'medium' },
                            { property: 'namespace', header: 'Namespace', size: 'small' },
                            { property: 'value', header: 'Memory', render: d => d.value.toFixed(0) + ' MB', align: 'end' }
                        ]}
                        sort={{ property: 'value', direction: 'desc' }}
                        sortable
                        paginate
                        step={5}
                        border='horizontal'
                    />
                </Box>
            </Box>

            <Box>
                <Heading level="4">CPU Usage by Namespace</Heading>
                <DataTable
                    data={namespaceUsage}
                    columns={[
                        { property: 'namespace', header: 'Namespace' },
                        { property: 'value', header: 'Cores', render: d => d.value.toFixed(3), align: 'end' }
                    ]}
                    sort={{ property: 'value', direction: 'desc' }}
                    sortable
                    paginate
                    step={10}
                />
            </Box>
        </Box>
    );
};

const CustomQueryTab = () => {
    const [query, setQuery] = useState('');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [resultType, setResultType] = useState<string>('');
    const [metricType, setMetricType] = useState('CPU');

    const executeQuery = async () => {
        if (!query) return;
        setLoading(true);
        try {
            const res = await monitoringApi.query(query);
            if (res.data) {
                setResultType(res.data.resultType);
                if (res.data.resultType === 'vector') {
                    setData(res.data.result.map(r => ({
                        metric: JSON.stringify(r.metric),
                        value: r.value?.[1]
                    })));
                } else {
                    // Handle others lightly
                    setData(res.data.result);
                }
            }
        } catch (e: any) {
            notify.critical(`Query failed: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handlePredefined = (option: string) => {
        setMetricType(option);
        if (option === 'CPU') setQuery('sum(rate(container_cpu_usage_seconds_total{image!=""}[5m])) by (pod)');
        if (option === 'Memory') setQuery('sum(container_memory_working_set_bytes{image!=""}) by (pod)');
        if (option === 'Network Receive') setQuery('sum(rate(container_network_receive_bytes_total[5m])) by (pod)');
        if (option === 'Network Transmit') setQuery('sum(rate(container_network_transmit_bytes_total[5m])) by (pod)');
    };

    return (
        <Box pad={{ top: 'medium' }} gap="medium">
            <Box direction="row" gap="small" align="center">
                <Select
                    options={['CPU', 'Memory', 'Network Receive', 'Network Transmit']}
                    value={metricType}
                    onChange={({ option }) => handlePredefined(option)}
                    placeholder="Select Metric"
                />
                <Text color="text-weak">or type PromQL below</Text>
            </Box>

            <Box direction="row" gap="small">
                <TextArea
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Enter PromQL query... (e.g. up)"
                    resize="vertical"
                />
                <Button icon={<Search />} label="Run" onClick={executeQuery} disabled={loading} primary />
            </Box>

            <Box>
                {loading && <Spinner />}
                {!loading && data.length > 0 && resultType === 'vector' && (
                    <DataTable
                        data={data}
                        columns={[
                            { property: 'metric', header: 'Metric', size: 'large', render: d => <Text size="small" truncate>{JSON.parse(d.metric).pod}</Text> },
                            { property: 'value', header: 'Value', align: 'end', render: d => (d.value) }
                        ]}
                        sort={{ property: 'value', direction: 'desc' }}
                        sortable
                        paginate
                        step={10}
                    />
                )}
                {!loading && data.length > 0 && resultType !== 'vector' && (
                    <Box pad="small" background="light-2">
                        <Text>Chart visualization for '{resultType}' not fully implemented in this view. Use vector queries for table results.</Text>
                        <pre>{JSON.stringify(data, null, 2)}</pre>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
